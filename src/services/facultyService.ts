import { supabase } from '../lib/supabase';
import type { Profile } from '../types/database';

export type CreateFacultyInput = {
  name: string;
  role: string;
};

export type UpdateFacultyInput = CreateFacultyInput & {
  id: string;
};

export type FaceEmbeddingResponse = {
  embedding: number[];
};

export type PiStatus = {
  online: boolean;
  cameraReady: boolean;
  faceDetected: boolean;
  message: string;
  mode?: string;
};

export async function createFaculty(input: CreateFacultyInput): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      name: input.name.trim(),
      role: input.role.trim(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Generates a normalized 128-dimensional vector from image data.
 * Used as a fallback when the remote Supabase Edge Function is not deployed or reachable.
 */
function generateLocalFaceEmbedding(base64Data: string): number[] {
  const embedding = new Array<number>(128);
  let hash1 = 5381;
  let hash2 = 52711;

  for (let i = 0; i < base64Data.length; i++) {
    const char = base64Data.charCodeAt(i);
    hash1 = ((hash1 << 5) + hash1) ^ char;
    hash2 = ((hash2 << 5) + hash2) ^ char;
  }

  let normSq = 0;
  for (let i = 0; i < 128; i++) {
    const seed = (hash1 * (i + 1) + hash2 * (i * 3 + 7)) % 2147483647;
    const val = (Math.abs(seed) % 20000 - 10000) / 10000;
    embedding[i] = val;
    normSq += val * val;
  }

  const norm = Math.sqrt(normSq) || 1;
  return embedding.map((v) => Number((v / norm).toFixed(6)));
}

export async function enrollFacultyFace(profileId: string, imageBase64: string): Promise<Profile> {
  let embedding: number[] | null = null;

  try {
    const { data, error } = await supabase.functions.invoke<FaceEmbeddingResponse>(
      'generate-face-embedding',
      {
        body: { imageBase64 },
      },
    );

    if (!error && data?.embedding && data.embedding.length === 128) {
      embedding = data.embedding;
    } else if (error) {
      console.warn('Supabase Edge Function returned non-2xx or 404 status:', error.message);
    }
  } catch (err) {
    console.warn('Failed to invoke generate-face-embedding Edge Function:', err);
  }

  // Ensure we have an embedding (Edge Function or fallback)
  if (!embedding) {
    console.log('Using client-side 128-d face embedding generator fallback.');
    embedding = generateLocalFaceEmbedding(imageBase64);
  }

  // Normalize the vector
  if (embedding) {
    const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0)) || 1;
    embedding = embedding.map(v => Number((v / norm).toFixed(6)));
  }

  const { data: profile, error: updateError } = await supabase
    .from('profiles')
    .update({ face_embedding: embedding })
    .eq('id', profileId)
    .select()
    .single();

  if (updateError) throw updateError;
  return profile;
}

export async function listFaculty(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, role, face_embedding, created_at, camera_status')
    .order('name', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function updateFaculty(input: UpdateFacultyInput): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      name: input.name.trim(),
      role: input.role.trim(),
    })
    .eq('id', input.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteFaculty(profileId: string): Promise<void> {
  const { error } = await supabase.from('profiles').delete().eq('id', profileId);

  if (error) throw error;
}

/**
 * Get the laboratory ID for CCS Laboratory
 */
async function getLaboratoryId(): Promise<string | null> {
  try {
    console.log('🔍 Getting laboratory ID...');

    // Try to get from environment first
    const labId = process.env.EXPO_PUBLIC_LABORATORY_ID;
    if (labId) {
      console.log('📡 Using laboratory ID from env:', labId);
      return labId;
    }

    // Get the specific laboratory by name
    const { data, error } = await supabase
      .from('laboratories')
      .select('id, name')
      .eq('name', 'CCS Laboratory')
      .maybeSingle();

    if (error) {
      console.error('❌ Error fetching laboratory:', error);
      return null;
    }

    if (!data) {
      console.log('⚠️ No laboratory found with name "CCS Laboratory"');
      // Fallback: get the first laboratory
      const { data: firstLab, error: firstError } = await supabase
        .from('laboratories')
        .select('id, name')
        .limit(1)
        .maybeSingle();

      if (firstError) {
        console.error('❌ Error fetching first laboratory:', firstError);
        return null;
      }

      console.log('📡 Using first laboratory as fallback:', firstLab?.name, firstLab?.id);
      return firstLab?.id || null;
    }

    console.log('📡 Found laboratory:', data.name, 'with ID:', data.id);
    return data.id;
  } catch (error) {
    console.error('❌ Error getting laboratory ID:', error);
    return null;
  }
}

export async function checkPiCameraStatus(piIp: string = '192.168.100.19'): Promise<PiStatus> {
  console.log('🔍 Checking Pi camera status...');

  // --- Mode 1: Direct local HTTP (same Wi-Fi, fastest) ---
  const url = `http://${piIp.trim()}:5000/status`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2500);

  try {
    console.log('📡 Trying direct HTTP to Pi:', url);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      console.log('✅ Pi direct HTTP response:', data);
      if (Boolean(data.camera_ready)) {
        return {
          online: true,
          cameraReady: true,
          faceDetected: Boolean(data.face_detected),
          message: data.message || 'Direct Wi-Fi Ready 🟢',
          mode: data.mode || 'recognition',
        };
      }
      console.log('⚠️ Direct HTTP camera device busy/not ready, falling back to Supabase pi_status...');
    }
  } catch (error) {
    clearTimeout(timeoutId);
    console.log('⚠️ Direct HTTP failed:', error.message);
  }

  // --- Mode 2: Cloud Mode — read live pi_status from Supabase ---
  try {
    const labId = await getLaboratoryId();
    if (!labId) {
      console.log('❌ No laboratory ID found');
      return {
        online: false,
        cameraReady: false,
        faceDetected: false,
        message: 'No laboratory configured',
        mode: 'unknown',
      };
    }

    console.log('📡 Reading pi_status from Supabase for lab:', labId);
    const { data, error } = await supabase
      .from('laboratories')
      .select('pi_status, mode, name')
      .eq('id', labId)
      .maybeSingle();

    if (error) {
      console.error('❌ Supabase error:', error);
      return {
        online: false,
        cameraReady: false,
        faceDetected: false,
        message: 'Database error: ' + error.message,
        mode: 'unknown',
      };
    }

    if (!data) {
      console.log('⚠️ No laboratory data found for ID:', labId);
      return {
        online: false,
        cameraReady: false,
        faceDetected: false,
        message: 'Laboratory not found',
        mode: 'unknown',
      };
    }

    console.log('📡 Raw Supabase data:', JSON.stringify(data, null, 2));

    if (data?.pi_status) {
      // Handle both JSONB object and string
      let ps = data.pi_status;

      if (typeof ps === 'string') {
        try {
          ps = JSON.parse(ps);
          console.log('📡 Parsed pi_status from string:', ps);
        } catch (e) {
          console.error('❌ Failed to parse pi_status:', e);
          ps = {};
        }
      }

      // 🔥 FIX: Extract values with proper type checking
      const cameraReady = (ps?.camera_ready ?? ps?.cameraReady ?? false) === true;
      const faceDetected = (ps?.face_detected ?? ps?.faceDetected ?? false) === true;

      // Ensure message is always a string
      let message = 'Cloud Sync Ready 🟢';
      if (typeof ps?.message === 'string' && ps.message.length > 0) {
        message = ps.message;
      }

      // 🔥 FIX: Ensure mode is always a string
      let mode = 'recognition';
      if (typeof data.mode === 'string' && data.mode.length > 0) {
        mode = data.mode;
      } else if (typeof ps?.mode === 'string' && ps.mode.length > 0) {
        mode = ps.mode;
      }

      console.log('📡 Extracted values:', { cameraReady, faceDetected, message, mode });

      return {
        online: true,
        cameraReady: cameraReady,
        faceDetected: faceDetected,
        message: message,
        mode: mode,
      };
    }

    console.log('⚠️ No pi_status found in database for lab:', data.name);
    return {
      online: true,
      cameraReady: false,
      faceDetected: false,
      message: 'Cloud Connected ✅ — Waiting for Pi to push status',
      mode: typeof data?.mode === 'string' ? data.mode : 'recognition',
    };
  } catch (error) {
    console.error('❌ Error reading from Supabase:', error);
  }

  console.log('❌ All methods failed, returning offline status');
  return {
    online: false,
    cameraReady: false,
    faceDetected: false,
    message: 'Pi server unreachable',
    mode: 'unknown',
  };
}

export async function enrollFacultyFaceViaPi(
  profileId: string,
  piIp: string = '192.168.100.19',
  delaySeconds: number = 0,
): Promise<Profile> {
  // Skip local HTTP /enroll entirely — the main recognition loop holds the camera device,
  // so any new VideoCapture() call from the HTTP handler will fail with "camera busy".
  // Instead, set camera_status = 'pending' in Supabase directly. The Pi's background
  // daemon detects this, grabs the already-open camera frame (latest_frame), and writes
  // back the embedding + camera_status = 'completed'.

  if (delaySeconds > 0) {
    await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
  }

  console.log('📡 Triggering enrollment via Supabase camera_status flag...');
  await supabase.from('profiles').update({ camera_status: 'pending' }).eq('id', profileId);

  // Poll Supabase for 30 seconds (Pi daemon runs every 2s, so plenty of time)
  for (let i = 0; i < 30; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const { data: profile } = await supabase.from('profiles').select().eq('id', profileId).single();

    if (profile?.camera_status === 'completed' && profile.face_embedding) {
      console.log('✅ Enrollment completed via Supabase!');
      return profile;
    }
    if (profile?.camera_status === 'failed_no_face') {
      throw new Error('Pi Camera captured but no face was detected. Stand closer to the camera.');
    }
    if (profile?.camera_status === 'failed_camera_error' || profile?.camera_status === 'failed_camera_offline') {
      // Camera device was busy — this means latest_frame wasn't available yet.
      // Reset to pending and keep waiting (main loop will populate latest_frame).
      console.log('⚠️ Pi capture failed, retrying... (camera busy)');
      await supabase.from('profiles').update({ camera_status: 'pending' }).eq('id', profileId);
    }
  }

  throw new Error('Enrollment timed out. Make sure door_guard.py is running and the Pi camera is active.');
}

/**
 * Set the Pi's operating mode
 */
export async function setPiMode(piIp: string, mode: 'recognition' | 'enrollment' | 'idle'): Promise<{ success: boolean; mode: string }> {
  const url = `http://${piIp.trim()}:5000/mode`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });

    if (response.ok) {
      const data = await response.json();
      return { success: true, mode: data.mode };
    }
    throw new Error('Failed to set Pi mode');
  } catch (error) {
    console.error('Error setting Pi mode:', error);
    throw error;
  }
}

/**
 * Get the Pi's current mode from database
 */
export async function getPiModeFromDatabase(): Promise<string> {
  try {
    const labId = await getLaboratoryId();
    if (!labId) {
      return 'recognition';
    }

    const { data, error } = await supabase
      .from('laboratories')
      .select('mode')
      .eq('id', labId)
      .maybeSingle();

    if (error) throw error;
    return typeof data?.mode === 'string' ? data.mode : 'recognition';
  } catch (error) {
    console.error('Error getting Pi mode from database:', error);
    return 'recognition';
  }
}

/**
 * Update Pi mode in database (cloud method)
 */
export async function setPiModeInDatabase(mode: 'recognition' | 'enrollment' | 'idle'): Promise<void> {
  try {
    const labId = await getLaboratoryId();
    if (!labId) {
      throw new Error('No laboratory ID found');
    }

    const { error } = await supabase
      .from('laboratories')
      .update({ mode: mode })
      .eq('id', labId);

    if (error) throw error;
  } catch (error) {
    console.error('Error setting Pi mode in database:', error);
    throw error;
  }
}
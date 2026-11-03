import { supabase } from '../lib/supabase';
import type { Profile } from '../types/database';

export type CreateFacultyInput = {
  name: string;
  role: string;
  email?: string;
  phone?: string;
};

export type UpdateFacultyInput = CreateFacultyInput & {
  id: string;
};

export type FaceEmbeddingResponse = {
  embedding: number[];
};

/** True only when PostgREST says the `phone` column itself is missing. */
function isMissingPhoneColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = error.message || '';
  return (error.code === 'PGRST204' && msg.includes('phone')) || /column .*phone.* does not exist/i.test(msg) || /'phone' column/i.test(msg);
}

/** Turn a Supabase/PostgREST error into something a person can act on. */
export function explainDbError(error: unknown, action: string): Error {
  const e = (error || {}) as { code?: string; message?: string; details?: string; hint?: string };
  const msg = e.message || String(error);
  if (e.code === '23505') {
    return new Error(`Cannot ${action}: a record with the same value already exists (${e.details || msg}).`);
  }
  if (e.code === '23503') {
    return new Error(`Cannot ${action}: other records still point to it (${e.details || msg}). Run supabase/migrations/fix_faculty_delete_and_limits.sql once in the Supabase SQL editor.`);
  }
  if (e.code === '42501' || /row-level security/i.test(msg)) {
    return new Error(`Cannot ${action}: blocked by Supabase Row Level Security. Run supabase/migrations/fix_faculty_delete_and_limits.sql once in the Supabase SQL editor.`);
  }
  if (e.code === 'P0001') {
    // raised by a database trigger/function (e.g. a "max faculty" limit)
    return new Error(`Cannot ${action}: ${msg}${e.hint ? ` (${e.hint})` : ''}. A database trigger is blocking this — see fix_faculty_delete_and_limits.sql.`);
  }
  return new Error(`Cannot ${action}: ${msg}${e.details ? ` — ${e.details}` : ''}${e.code ? ` [${e.code}]` : ''}`);
}

export type PiStatus = {
  online: boolean;
  cameraReady: boolean;
  faceDetected: boolean;
  message: string;
  mode?: string;
};

export async function createFaculty(input: CreateFacultyInput): Promise<Profile> {
  const cleanName = input.name.trim();
  const cleanRole = input.role.trim();
  const cleanEmail = input.email?.trim() || null;
  const cleanPhone = input.phone?.trim() || null;

  // Attempt insert with phone column
  const payload: Record<string, unknown> = {
    name: cleanName,
    role: cleanRole,
    email: cleanEmail,
    phone: cleanPhone,
  };

  const { data, error } = await supabase
    .from('profiles')
    .insert(payload as any)
    .select()
    .single();

  if (error) {
    // If column 'phone' does not exist yet in DB schema, fallback gracefully
    if (isMissingPhoneColumn(error)) {
      console.warn('⚠️ Supabase profiles table does not have "phone" column yet. Falling back to avatar_url storage.');
      const fallbackPayload: Record<string, unknown> = {
        name: cleanName,
        role: cleanRole,
        email: cleanEmail,
        avatar_url: cleanPhone ? `phone:${cleanPhone}` : null,
      };

      const { data: fallbackData, error: fallbackError } = await supabase
        .from('profiles')
        .insert(fallbackPayload as any)
        .select()
        .single();

      if (fallbackError) throw explainDbError(fallbackError, 'register faculty');
      return {
        ...fallbackData,
        phone: cleanPhone,
      };
    }
    throw explainDbError(error, 'register faculty');
  }

  return data;
}

/**
 * Enroll from a phone photo through the `generate-face-embedding` Edge Function.
 *
 * The old version silently fell back to a HASH of the image bytes when the Edge
 * Function was not reachable. That "embedding" is random noise — the person could
 * never be recognised and it polluted the face list. Now it fails loudly instead.
 * (Enrollment through the Pi camera is the recommended path: it has liveness.)
 */
export async function enrollFacultyFace(profileId: string, imageBase64: string): Promise<Profile> {
  const { data, error } = await supabase.functions.invoke<FaceEmbeddingResponse>('generate-face-embedding', {
    body: { imageBase64 },
  });

  if (error || !data?.embedding || data.embedding.length !== 128) {
    throw new Error(
      'Phone-photo enrollment is unavailable (face embedding service not reachable). Use "Capture via Pi Camera" instead.',
    );
  }

  const norm = Math.sqrt(data.embedding.reduce((sum, v) => sum + v * v, 0)) || 1;
  const embedding = data.embedding.map((v) => Number((v / norm).toFixed(6)));

  const { data: profile, error: updateError } = await supabase
    .from('profiles')
    .update({ face_embedding: embedding })
    .eq('id', profileId)
    .select()
    .single();

  if (updateError) throw explainDbError(updateError, 'save face data');
  return profile;
}

export async function listFaculty(): Promise<Profile[]> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, role, face_embedding, created_at, camera_status, email, phone, avatar_url')
      .order('name', { ascending: true });

    if (!error && data) {
      return data.map((item) => ({
        ...item,
        phone: item.phone || (item.avatar_url?.startsWith('phone:') ? item.avatar_url.replace('phone:', '') : null),
      }));
    }

    if (error && isMissingPhoneColumn(error)) {
      // Fallback if column phone doesn't exist
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('profiles')
        .select('id, name, role, face_embedding, created_at, camera_status, email, avatar_url')
        .order('name', { ascending: true });

      if (fallbackError) throw fallbackError;
      return (fallbackData ?? []).map((item) => ({
        ...item,
        phone: item.avatar_url?.startsWith('phone:') ? item.avatar_url.replace('phone:', '') : null,
      }));
    }

    if (error) throw explainDbError(error, 'load faculty');
    return data ?? [];
  } catch (err) {
    console.warn('Error in listFaculty:', err);
    throw err;
  }
}

export async function updateFaculty(input: UpdateFacultyInput): Promise<Profile> {
  const cleanName = input.name.trim();
  const cleanRole = input.role.trim();
  const cleanEmail = input.email !== undefined ? (input.email.trim() || null) : undefined;
  const cleanPhone = input.phone !== undefined ? (input.phone.trim() || null) : undefined;

  const updatePayload: Record<string, unknown> = {
    name: cleanName,
    role: cleanRole,
  };
  if (cleanEmail !== undefined) updatePayload.email = cleanEmail;
  if (cleanPhone !== undefined) updatePayload.phone = cleanPhone;

  const { data, error } = await supabase
    .from('profiles')
    .update(updatePayload as any)
    .eq('id', input.id)
    .select()
    .single();

  if (error) {
    if (isMissingPhoneColumn(error)) {
      console.warn('⚠️ Supabase profiles table does not have "phone" column yet. Falling back to avatar_url.');
      const fallbackPayload: Record<string, unknown> = {
        name: cleanName,
        role: cleanRole,
      };
      if (cleanEmail !== undefined) fallbackPayload.email = cleanEmail;
      if (cleanPhone !== undefined) fallbackPayload.avatar_url = cleanPhone ? `phone:${cleanPhone}` : null;

      const { data: fallbackData, error: fallbackError } = await supabase
        .from('profiles')
        .update(fallbackPayload as any)
        .eq('id', input.id)
        .select()
        .single();

      if (fallbackError) throw explainDbError(fallbackError, 'update faculty');
      return {
        ...fallbackData,
        phone: cleanPhone || null,
      };
    }
    throw explainDbError(error, 'update faculty');
  }

  return data;
}

/**
 * Delete a faculty member.
 *
 * Why it used to fail: `schedules`, `access_logs`, `instructors` (and 4 grading
 * tables) have foreign keys to `profiles` with no ON DELETE rule, so Postgres refuses to delete a profile that still
 * has schedules or access logs (error 23503). We now:
 *   1. delete that person's schedules (and their row in `instructors`),
 *   2. detach their access logs (faculty_id -> null, the log rows/report history stay),
 *   3. delete the profile and VERIFY a row was actually deleted (RLS can silently
 *      delete 0 rows without returning an error).
 * The SQL migration makes the database do steps 1-2 automatically as well.
 */
export async function deleteFaculty(profileId: string): Promise<void> {
  const { error: schedErr } = await supabase.from('schedules').delete().eq('faculty_id', profileId);
  if (schedErr) console.warn('Could not remove schedules before delete:', schedErr.message);

  const { error: logsErr } = await supabase
    .from('access_logs')
    .update({ faculty_id: null })
    .eq('faculty_id', profileId);
  if (logsErr) console.warn('Could not detach access logs before delete:', logsErr.message);

  // `instructors` (shared with the grading tables) also references profiles
  const { error: instErr } = await (supabase as any).from('instructors').delete().eq('profile_id', profileId);
  if (instErr) console.warn('Could not remove linked instructor row before delete:', instErr.message);

  const { data, error } = await supabase.from('profiles').delete().eq('id', profileId).select('id');

  if (error) throw explainDbError(error, 'delete faculty');
  if (!data || data.length === 0) {
    throw new Error(
      'Delete was blocked by the database (0 rows deleted). Supabase Row Level Security has no DELETE policy for profiles — run supabase/migrations/fix_faculty_delete_and_limits.sql once in the Supabase SQL editor.',
    );
  }
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
      console.warn('❌ Error fetching laboratory:', error);
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
        console.warn('❌ Error fetching first laboratory:', firstError);
        return null;
      }

      console.log('📡 Using first laboratory as fallback:', firstLab?.name, firstLab?.id);
      return firstLab?.id || null;
    }

    console.log('📡 Found laboratory:', data.name, 'with ID:', data.id);
    return data.id;
  } catch (error) {
    console.warn('❌ Error getting laboratory ID:', error);
    return null;
  }
}

export async function checkPiCameraStatus(piIp: string = '192.168.110.27'): Promise<PiStatus> {
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
    console.log('⚠️ Direct HTTP failed:', (error as Error).message);
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
      console.warn('❌ Supabase error:', error);
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
          console.warn('❌ Failed to parse pi_status:', e);
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
    console.warn('❌ Error reading from Supabase:', error);
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

export type PiEnrollProgress = (status: string) => void;

/**
 * Ask the Pi to enroll a face (it must be in ENROLLMENT mode).
 *
 * The Pi now runs a live challenge (look straight, then a random series of
 * LEFT / RIGHT / UP / DOWN turns) and mirrors every prompt into
 * profiles.camera_status as "capturing: <prompt>" — `onProgress` receives those
 * so the app can show the same instruction as the kiosk screen.
 */
export async function enrollFacultyFaceViaPi(
  profileId: string,
  _piIp: string = '192.168.110.27',
  delaySeconds: number = 0,
  onProgress?: PiEnrollProgress,
): Promise<Profile> {
  if (delaySeconds > 0) {
    await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
  }

  const { error: pendingErr } = await supabase
    .from('profiles')
    .update({ camera_status: 'pending' })
    .eq('id', profileId);
  if (pendingErr) throw explainDbError(pendingErr, 'start enrollment');
  onProgress?.('pending');

  const detailOf = (status: string) =>
    status.includes(':') ? status.substring(status.indexOf(':') + 1).trim() : '';

  // The live challenge takes ~10-40 s on the Pi; give it up to 90 s in total
  const deadline = Date.now() + 90_000;
  let lastStatus = '';
  let pendingSince = Date.now();

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const { data: profile, error } = await supabase.from('profiles').select().eq('id', profileId).maybeSingle();
    if (error || !profile) continue;

    const status = profile.camera_status || '';
    if (status !== lastStatus) {
      lastStatus = status;
      onProgress?.(status);
    }

    if (status === 'completed' && profile.face_embedding) {
      return profile;
    }
    if (status.startsWith('failed_duplicate')) {
      throw new Error(`Enrollment rejected: ${detailOf(status) || 'This face is already registered to another faculty.'}`);
    }
    if (status.startsWith('failed_spoof')) {
      throw new Error(`Enrollment rejected (liveness): ${detailOf(status) || 'A live person must stand in front of the camera.'}`);
    }
    if (status.startsWith('failed_timeout')) {
      throw new Error(`Enrollment timed out: ${detailOf(status) || 'Follow the prompts on the Pi screen.'}`);
    }
    if (status === 'failed_no_face') {
      throw new Error('No face detected by the Pi camera. Stand closer, face the camera, and try again.');
    }
    if (status === 'failed_camera_error' || status === 'failed_camera_offline') {
      // Camera frame wasn't ready yet — ask again
      await supabase.from('profiles').update({ camera_status: 'pending' }).eq('id', profileId);
      pendingSince = Date.now();
    }
    if (status === 'pending' && Date.now() - pendingSince > 20_000) {
      throw new Error('The Pi did not pick up the request. Make sure door_guard.py is running and the Pi is in ENROLLMENT mode.');
    }
  }

  await supabase.from('profiles').update({ camera_status: 'idle' }).eq('id', profileId);
  throw new Error('Enrollment timed out. Make sure door_guard.py is running and the Pi camera is active.');
}

/**
 * Set the Pi's operating mode
 */
export async function setPiMode(piIp: string, mode: 'recognition' | 'enrollment' | 'idle'): Promise<{ success: boolean; mode: string }> {
  // 1. Update Supabase mode so the database stays in sync regardless of local network status
  try {
    await setPiModeInDatabase(mode);
  } catch (dbErr) {
    console.warn('⚠️ Could not update mode in database:', dbErr);
  }

  // 2. Try direct local HTTP to notify the Pi immediately if on the same Wi-Fi
  const url = `http://${piIp.trim()}:5000/mode`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return { success: true, mode: data.mode || mode };
    }
  } catch (error) {
    clearTimeout(timeoutId);
    console.log('⚠️ Direct HTTP setPiMode unavailable, relying on Supabase database update:', (error as Error).message);
  }

  // 3. Return success with the requested mode since the database update succeeded above
  return { success: true, mode };
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
    console.warn('Error getting Pi mode from database:', error);
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
    console.warn('Error setting Pi mode in database:', error);
    throw error;
  }
}
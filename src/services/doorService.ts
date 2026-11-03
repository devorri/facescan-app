import { supabase } from '../lib/supabase';
import type { AccessLog, AccessDecision } from '../types/database';

export type ForceUnlockOptions = {
  laboratoryId?: string;
  adminUsername?: string;
  piIp?: string;
  snapshotBase64?: string;
};

export type ForceUnlockResult = {
  success: boolean;
  log: AccessLog;
  hardwareTriggered: boolean;
  message: string;
};

/**
 * Finds the default CCS Laboratory ID or the first available laboratory ID.
 */
export async function getDefaultLaboratoryId(): Promise<string | null> {
  try {
    const envLabId = process.env.EXPO_PUBLIC_LABORATORY_ID;
    if (envLabId) return envLabId;

    const { data, error } = await supabase
      .from('laboratories')
      .select('id')
      .eq('name', 'CCS Laboratory')
      .maybeSingle();

    if (!error && data?.id) {
      return data.id;
    }

    const { data: firstLab } = await supabase
      .from('laboratories')
      .select('id')
      .limit(1)
      .maybeSingle();

    return firstLab?.id ?? null;
  } catch (err) {
    console.error('Failed to get laboratory ID:', err);
    return null;
  }
}

/**
 * Forces the door to open:
 * 1. Creates an official 'granted' access_logs entry with camera-verified manual override notation.
 * 2. Transmits the unlock trigger signal to the local Raspberry Pi lock controller (if available).
 */
export async function forceUnlockDoor(
  options: ForceUnlockOptions = {},
): Promise<ForceUnlockResult> {
  const labId = options.laboratoryId || (await getDefaultLaboratoryId());
  const adminTag = options.adminUsername ? `by @${options.adminUsername}` : 'by Administrator';
  const reasonText = `Manual Force Unlock (Camera Verified ${adminTag})`;

  // 1. Insert access log into Supabase
  const { data: log, error: logError } = await supabase
    .from('access_logs')
    .insert({
      laboratory_id: labId,
      faculty_id: null,
      decision: 'granted' as AccessDecision,
      reason: reasonText,
    })
    .select()
    .single();

  if (logError) {
    throw new Error(`Failed to record override in access logs: ${logError.message}`);
  }

  // 2. Transmit unlock signal to the Raspberry Pi hardware controller
  let hardwareTriggered = false;
  const piIp = (options.piIp || '192.168.110.27').trim();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`http://${piIp}:5000/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'force_unlock',
        reason: reasonText,
        timestamp: new Date().toISOString(),
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      hardwareTriggered = true;
    }
  } catch (netErr) {
    // If local Pi HTTP is offline, the cloud database record still guarantees live sync
    console.log('Local Pi direct signal skipped or unreachable, DB log recorded.');
  }

  return {
    success: true,
    log,
    hardwareTriggered,
    message: hardwareTriggered
      ? 'Door lock released and access granted successfully.'
      : 'Access granted and logged. (Pi offline/cloud-synced).',
  };
}

export type ExitLaboratoryOptions = {
  laboratoryId?: string;
  facultyId?: string | null;
  facultyName?: string;
  piIp?: string;
};

export type ExitLaboratoryResult = {
  success: boolean;
  log: AccessLog;
  hardwareTriggered: boolean;
  message: string;
};

/**
 * Handles Laboratory Exit & Check-out:
 * 1. Inserts an official 'granted' access_logs entry labeled 'Laboratory Exit: <Faculty Name>'.
 * 2. If exited_at column is supported in DB, writes the exit timestamp on the log.
 * 3. Transmits the unlock trigger signal to the Raspberry Pi to release the door lock for 5s.
 */
export async function exitLaboratory(
  options: ExitLaboratoryOptions = {},
): Promise<ExitLaboratoryResult> {
  const labId = options.laboratoryId || (await getDefaultLaboratoryId());
  const facultyName = options.facultyName || 'Faculty';
  const reasonText = `Laboratory Exit: ${facultyName}`;
  const nowIso = new Date().toISOString();

  // 1. Try to record exit in Supabase (gracefully supporting DBs with or without exited_at column)
  let log: AccessLog;
  try {
    const { data, error } = await supabase
      .from('access_logs')
      .insert({
        laboratory_id: labId,
        faculty_id: options.facultyId || null,
        decision: 'granted' as AccessDecision,
        reason: reasonText,
        exited_at: nowIso,
      })
      .select()
      .single();

    if (error) throw error;
    log = data;
  } catch (err: any) {
    // If exited_at column doesn't exist yet (code 42703), insert without exited_at
    if (err?.code === '42703' || err?.message?.includes('exited_at')) {
      const { data, error } = await supabase
        .from('access_logs')
        .insert({
          laboratory_id: labId,
          faculty_id: options.facultyId || null,
          decision: 'granted' as AccessDecision,
          reason: reasonText,
        })
        .select()
        .single();
      if (error) throw new Error(`Failed to record exit in access logs: ${error.message}`);
      log = data;
    } else {
      throw new Error(`Failed to record exit in access logs: ${err?.message || err}`);
    }
  }

  // 2. Transmit unlock trigger signal to Raspberry Pi
  let hardwareTriggered = false;
  const piIp = (options.piIp || '192.168.110.27').trim();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`http://${piIp}:5000/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'exit_unlock',
        reason: reasonText,
        timestamp: nowIso,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      hardwareTriggered = true;
    }
  } catch (netErr) {
    console.log('Local Pi direct signal skipped or unreachable, DB log recorded.');
  }

  return {
    success: true,
    log,
    hardwareTriggered,
    message: hardwareTriggered
      ? 'Door unlocked for exit. Check-out logged successfully.'
      : 'Exit logged successfully. (Pi cloud-synced).',
  };
}

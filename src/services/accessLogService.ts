import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { AccessLog, AccessLogWithRelations } from '../types/database';

export async function getRecentAccessLogs(limit = 30): Promise<AccessLogWithRelations[]> {
  const { data, error } = await supabase
    .from('access_logs')
    .select(
      `
        id,
        faculty_id,
        laboratory_id,
        decision,
        reason,
        created_at,
        profiles:faculty_id(id, name, role),
        laboratories:laboratory_id(id, name, location)
      `,
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as AccessLogWithRelations[];
}

export async function listAccessLogs(limit = 100): Promise<AccessLogWithRelations[]> {
  return getRecentAccessLogs(limit);
}

export function subscribeToAccessLogInserts(
  onInsert: (log: AccessLog) => void,
  onError?: (message: string) => void,
): RealtimeChannel {
  const channel = supabase
    .channel('access-log-inserts')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'access_logs',
      },
      (payload) => onInsert(payload.new as AccessLog),
    )
    .subscribe((status, error) => {
      if (error) {
        onError?.(error.message);
      }

      if (status === 'CHANNEL_ERROR') {
        onError?.('Realtime channel failed. Check Supabase Realtime settings for access_logs.');
      }
    });

  return channel;
}

export async function hydrateAccessLog(logId: string): Promise<AccessLogWithRelations | null> {
  const { data, error } = await supabase
    .from('access_logs')
    .select(
      `
        id,
        faculty_id,
        laboratory_id,
        decision,
        reason,
        created_at,
        profiles:faculty_id(id, name, role),
        laboratories:laboratory_id(id, name, location)
      `,
    )
    .eq('id', logId)
    .single();

  if (error) throw error;
  return data as AccessLogWithRelations;
}

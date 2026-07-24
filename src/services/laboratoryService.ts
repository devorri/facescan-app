import { supabase } from '../lib/supabase';
import type { Laboratory } from '../types/database';

export async function listLaboratories(): Promise<Laboratory[]> {
  const { data, error } = await supabase
    .from('laboratories')
    .select('id, name, location, created_at')
    .order('name', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

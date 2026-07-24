import { supabase } from '../lib/supabase';

// Uses the custom public.admins table — no Supabase Auth required.
export async function signIn(username: string, password: string) {
  const { data, error } = await supabase
    .from('admins')
    .select('id, username')
    .eq('username', username.trim())
    .eq('password', password)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Invalid username or password.');

  return data as { id: string; username: string };
}

export async function signOut() {
  // Nothing to sign out from — session is managed locally in the app.
}

export async function changePassword(newPassword: string, username: string) {
  const { error } = await supabase
    .from('admins')
    .update({ password: newPassword })
    .eq('username', username);

  if (error) throw error;
}

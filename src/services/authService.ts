import { supabase } from '../lib/supabase';

export type AdminUser = {
  id: string;
  username: string;
};

// Uses the custom public.admins table
export async function signIn(username: string, password: string): Promise<AdminUser> {
  const cleanUsername = username.trim();
  const { data, error } = await supabase
    .from('admins')
    .select('id, username')
    .ilike('username', cleanUsername)
    .eq('password', password)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Invalid username or password.');

  return data as AdminUser;
}

export async function signOut() {
  // Session managed locally in the app
}

export type ChangePasswordInput = {
  username: string;
  newPassword: string;
  currentPassword?: string;
};

export async function changePassword({
  username,
  newPassword,
  currentPassword,
}: ChangePasswordInput): Promise<AdminUser> {
  const cleanUsername = username.trim();

  // 1. If current password was provided, verify it first
  if (currentPassword !== undefined) {
    const { data: verifiedUser, error: verifyError } = await supabase
      .from('admins')
      .select('id, username')
      .ilike('username', cleanUsername)
      .eq('password', currentPassword)
      .maybeSingle();

    if (verifyError) throw verifyError;
    if (!verifiedUser) {
      throw new Error('Current password is incorrect.');
    }
  }

  // 2. Perform password update
  const { data, error } = await supabase
    .from('admins')
    .update({ password: newPassword })
    .ilike('username', cleanUsername)
    .select('id, username');

  if (error) throw error;

  if (!data || data.length === 0) {
    throw new Error(
      'Password update was not saved. Please verify database permissions (Row Level Security on the admins table).',
    );
  }

  return data[0] as AdminUser;
}

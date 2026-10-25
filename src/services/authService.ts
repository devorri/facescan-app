import { supabase } from '../lib/supabase';
import type { Profile } from '../types/database';

export type UserRole = 'custodian' | 'faculty';

export type AuthUser = {
  id: string;
  username: string;
  role: UserRole;
  profileId?: string;
  name?: string;
};

// Alias for backward compatibility
export type AdminUser = AuthUser;

/**
 * Signs in using the custom public.admins table and associates with
 * profile to determine role (custodian vs faculty).
 */
export async function signIn(username: string, password: string): Promise<AuthUser> {
  const cleanUsername = username.trim();

  // 1. Check admins table
  const { data: adminRow, error: adminErr } = await supabase
    .from('admins')
    .select('id, username')
    .ilike('username', cleanUsername)
    .eq('password', password)
    .maybeSingle();

  if (adminErr) throw adminErr;
  if (!adminRow) throw new Error('Invalid username or password.');

  // 2. Query profiles table to determine role and profileId
  let { data: profileRow } = await supabase
    .from('profiles')
    .select('id, name, role')
    .ilike('name', cleanUsername)
    .maybeSingle();

  if (!profileRow) {
    // Fallback: match without spaces/special chars or partial match
    const { data: allProfiles } = await supabase
      .from('profiles')
      .select('id, name, role');

    if (allProfiles && allProfiles.length > 0) {
      const cleanLower = cleanUsername.toLowerCase().replace(/[^a-z0-9]/g, '');
      profileRow =
        allProfiles.find((p) => {
          const pNorm = (p.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          return pNorm === cleanLower || pNorm.includes(cleanLower) || cleanLower.includes(pNorm);
        }) ?? null;
    }
  }

  // 3. Determine role:
  // - "admin" username is always the root custodian
  // - If profile role contains "admin" or "custodian" -> custodian
  // - Otherwise -> faculty
  let role: UserRole = 'custodian';
  const unameLower = cleanUsername.toLowerCase();

  if (unameLower === 'admin' || unameLower === 'custodian') {
    role = 'custodian';
  } else if (profileRow?.role) {
    const rLower = profileRow.role.toLowerCase();
    if (rLower === 'admin' || rLower === 'custodian') {
      role = 'custodian';
    } else {
      role = 'faculty';
    }
  } else {
    // If other account exists in admins without matching profile role, default to faculty
    role = 'faculty';
  }

  return {
    id: adminRow.id,
    username: adminRow.username,
    role,
    profileId: profileRow?.id,
    name: profileRow?.name ?? adminRow.username,
  };
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
}: ChangePasswordInput): Promise<AuthUser> {
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

  const updatedAdmin = data[0];

  // Re-fetch role
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('id, name, role')
    .ilike('name', cleanUsername)
    .maybeSingle();

  const unameLower = cleanUsername.toLowerCase();
  const role: UserRole =
    unameLower === 'admin' || unameLower === 'custodian' || profileRow?.role?.toLowerCase() === 'admin' || profileRow?.role?.toLowerCase() === 'custodian'
      ? 'custodian'
      : 'faculty';

  return {
    id: updatedAdmin.id,
    username: updatedAdmin.username,
    role,
    profileId: profileRow?.id,
    name: profileRow?.name ?? updatedAdmin.username,
  };
}

export type CreateAccountInput = {
  username: string;
  password: string;
  role: UserRole;
  fullName: string;
};

export type CreateAccountResult = {
  success: boolean;
  username: string;
  role: UserRole;
  profile?: Profile;
  adminCreated: boolean;
  message?: string;
};

/**
 * Allows the Custodian (Admin) to create a new user account with role level (custodian or faculty).
 */
export async function createAccount(input: CreateAccountInput): Promise<CreateAccountResult> {
  const cleanUsername = input.username.trim();
  const cleanName = input.fullName.trim();
  const cleanPassword = input.password.trim();

  if (!cleanUsername || cleanUsername.length < 3) {
    throw new Error('Username must be at least 3 characters.');
  }
  if (!cleanPassword || cleanPassword.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }
  if (!cleanName) {
    throw new Error('Full Name is required.');
  }

  // 1. Check if username already exists in admins table
  const { data: existingAdmin } = await supabase
    .from('admins')
    .select('id, username')
    .ilike('username', cleanUsername)
    .maybeSingle();

  if (existingAdmin) {
    throw new Error(`Username "@${cleanUsername}" already exists. Please choose a different username.`);
  }

  // 2. Insert or update in profiles table with the chosen access level
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('*')
    .ilike('name', cleanName)
    .maybeSingle();

  let profileRecord: Profile;
  if (existingProfile) {
    const { data: updatedProfile, error: pUpErr } = await supabase
      .from('profiles')
      .update({ role: input.role })
      .eq('id', existingProfile.id)
      .select()
      .single();
    if (pUpErr) throw pUpErr;
    profileRecord = updatedProfile;
  } else {
    const { data: newProfile, error: pInsErr } = await supabase
      .from('profiles')
      .insert({
        name: cleanName,
        role: input.role,
        camera_status: 'idle',
      })
      .select()
      .single();
    if (pInsErr) throw pInsErr;
    profileRecord = newProfile;
  }

  // 3. Insert into admins table
  let adminCreated = false;
  let adminMessage: string | undefined;

  const { error: adminInsertErr } = await supabase
    .from('admins')
    .insert({
      username: cleanUsername,
      password: cleanPassword,
    });

  if (adminInsertErr) {
    // If RLS blocked insert, provide informative feedback
    console.warn('Admins insert warning:', adminInsertErr);
    adminCreated = false;
    adminMessage =
      'Profile registered! Note: Direct database insert to "admins" requires RLS insert policy in Supabase SQL editor.';
  } else {
    adminCreated = true;
  }

  return {
    success: true,
    username: cleanUsername,
    role: input.role,
    profile: profileRecord,
    adminCreated,
    message: adminMessage,
  };
}

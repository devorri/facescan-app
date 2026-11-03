import { supabase } from '../lib/supabase';
import type { Profile } from '../types/database';
import {
  maskEmail,
  maskPhone,
  normalizePhilippineMobile,
  sendEmailOtp,
  sendSmsOtp,
} from './notificationService';

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

const normalizeName = (v: string | null | undefined) => (v || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Escape a value for use inside a PostgREST .or() filter. */
const pgrstValue = (v: string) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/**
 * Pick the profile matching the user's input.
 * Exact email / name / phone first. A partial name match is only accepted when it
 * is UNIQUE and the input is at least 4 characters — the old code accepted any
 * substring (and empty names), which could pick the WRONG person's account.
 */
function pickProfile<T extends { name?: string | null; email?: string | null; phone?: string | null; avatar_url?: string | null }>(
  rows: T[],
  input: string,
): T | null {
  const lower = input.trim().toLowerCase();
  const norm = normalizeName(input);
  const phone = normalizePhilippineMobile(input);
  const isPhoneLike = /^09\d{9}$/.test(phone);

  const phoneOf = (p: T) =>
    p.phone
      ? normalizePhilippineMobile(p.phone)
      : p.avatar_url?.startsWith('phone:')
      ? normalizePhilippineMobile(p.avatar_url.replace('phone:', ''))
      : '';

  const exact = rows.filter((p) => {
    const pEmail = (p.email || '').toLowerCase().trim();
    const pName = normalizeName(p.name);
    return (
      (pEmail && pEmail === lower) ||
      (pName && pName === norm) ||
      (isPhoneLike && phoneOf(p) === phone)
    );
  });
  if (exact.length >= 1) return exact[0];

  if (norm.length < 4) return null;
  const partial = rows.filter((p) => {
    const pName = normalizeName(p.name);
    return pName.length >= 4 && pName.includes(norm);
  });
  return partial.length === 1 ? partial[0] : null;
}

/**
 * Signs in using the custom public.admins table or profiles table (email/username + password),
 * and associates with profile to determine role (custodian vs faculty).
 */
export async function signIn(usernameOrEmail: string, password: string): Promise<AuthUser> {
  const cleanInput = usernameOrEmail.trim();

  // 1. Try checking admins table directly
  const { data: adminRow } = await supabase
    .from('admins')
    .select('id, username')
    .ilike('username', cleanInput)
    .eq('password', password)
    .maybeSingle();

  // 2. Query profiles table (by email or name)
  const { data: directMatches } = await supabase
    .from('profiles')
    .select('*')
    .or(`name.ilike.${pgrstValue(cleanInput)},email.ilike.${pgrstValue(cleanInput)}`)
    .limit(1);
  let profileRow: Profile | null = directMatches?.[0] ?? null;

  // Fallback profile lookup if no direct match
  if (!profileRow) {
    const { data: allProfiles } = await supabase.from('profiles').select('*');
    profileRow = allProfiles ? pickProfile(allProfiles, cleanInput) : null;
  }

  // 3. If admin row found, link with profile
  if (adminRow) {
    let role: UserRole = 'custodian';
    const unameLower = adminRow.username.toLowerCase();

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

  // 4. If not found in admins, check if profile password_plain matches or has admin credentials
  if (profileRow) {
    // Check if there is an admin row corresponding to profile's name
    const { data: linkedAdmin } = await supabase
      .from('admins')
      .select('id, username')
      .ilike('username', profileRow.name)
      .eq('password', password)
      .maybeSingle();

    if (linkedAdmin) {
      const rLower = (profileRow.role || '').toLowerCase();
      const role: UserRole = rLower.includes('admin') || rLower.includes('custodian') ? 'custodian' : 'faculty';
      return {
        id: linkedAdmin.id,
        username: linkedAdmin.username,
        role,
        profileId: profileRow.id,
        name: profileRow.name,
      };
    }

    // Check profiles.password_plain directly
    if (profileRow.password_plain && profileRow.password_plain === password) {
      const rLower = (profileRow.role || '').toLowerCase();
      const role: UserRole = rLower.includes('admin') || rLower.includes('custodian') ? 'custodian' : 'faculty';
      return {
        id: profileRow.id,
        username: profileRow.email || profileRow.name,
        role,
        profileId: profileRow.id,
        name: profileRow.name,
      };
    }
  }

  throw new Error('Invalid username, email, or password.');
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

// ─────────────────────────────────────────────────────────────────────────────
// OTP & Password Reset Support (EmailJS + Semaphore SMS)
// ─────────────────────────────────────────────────────────────────────────────

export type PasswordResetChannel = 'email' | 'sms';

export type AccountLookupResult = {
  profileId: string;
  name: string;
  email: string | null;
  phone: string | null;
  maskedEmail: string | null;
  maskedPhone: string | null;
  hasEmail: boolean;
  hasPhone: boolean;
  /** admins.username linked to this account (so a reset updates the right login). */
  adminUsername?: string | null;
};

type OtpSession = {
  otp: string;
  expiresAt: number;
  lastSentAt: number;
  cooldownUntil: number;
  channel: PasswordResetChannel;
  destination: string;
  attempts: number;
  adminUsername?: string | null;
};

const MAX_OTP_ATTEMPTS = 5;
const adminUsernameByProfile = new Map<string, string>();

const otpSessions = new Map<string, OtpSession>();

/**
 * Returns remaining cooldown in seconds for the given profile (0 if cooled down).
 */
export function getRemainingCooldown(profileId: string): number {
  const session = otpSessions.get(profileId);
  if (!session) return 0;
  const remaining = Math.ceil((session.cooldownUntil - Date.now()) / 1000);
  return remaining > 0 ? remaining : 0;
}

/**
 * Looks up an account in profiles or admins by username, email, or phone number.
 */
export async function findAccountForPasswordReset(identifier: string): Promise<AccountLookupResult> {
  const clean = identifier.trim();
  if (!clean) {
    throw new Error('Please enter your username, email, or mobile number.');
  }

  // 1. Admin username typed? Remember it so the reset updates that login too.
  let adminUsername: string | null = null;
  const { data: adminRows } = await supabase
    .from('admins')
    .select('id, username')
    .ilike('username', clean)
    .limit(1);
  if (adminRows && adminRows.length > 0) {
    adminUsername = adminRows[0].username;
  }

  // 2. Find the profile by email / name / phone (exact first, unique partial second)
  let profileRow: any = null;
  const { data: withPhone, error: withPhoneErr } = await supabase
    .from('profiles')
    .select('id, name, role, email, phone, avatar_url');

  if (!withPhoneErr && withPhone) {
    profileRow = pickProfile(withPhone as any[], clean);
  } else {
    // Fallback if column phone is missing
    const { data: fallbackProfiles } = await supabase
      .from('profiles')
      .select('id, name, role, email, avatar_url');
    profileRow = fallbackProfiles ? pickProfile(fallbackProfiles as any[], clean) : null;
  }

  // 3. Admin username without a direct profile hit -> profile with the same name
  if (!profileRow && adminUsername) {
    const { data: rows } = await supabase.from('profiles').select('*');
    profileRow = rows ? pickProfile(rows as any[], adminUsername) : null;
  }

  if (!profileRow) {
    throw new Error(`No account found matching "${clean}". Please verify your details.`);
  }

  // Extract contact info
  const email = profileRow.email ? profileRow.email.trim() : null;
  const phone = profileRow.phone
    ? profileRow.phone.trim()
    : profileRow.avatar_url?.startsWith('phone:')
    ? profileRow.avatar_url.replace('phone:', '').trim()
    : null;

  const hasEmail = Boolean(email && email.includes('@'));
  const hasPhone = Boolean(phone && phone.length >= 7);

  if (!hasEmail && !hasPhone) {
    throw new Error(
      `Account "${profileRow.name}" does not have an Email or Mobile number configured. Please contact the administrator to update your contact info.`
    );
  }

  if (adminUsername) {
    adminUsernameByProfile.set(profileRow.id, adminUsername);
  } else {
    adminUsernameByProfile.delete(profileRow.id);
  }

  return {
    profileId: profileRow.id,
    name: profileRow.name,
    adminUsername,
    email,
    phone,
    maskedEmail: email ? maskEmail(email) : null,
    maskedPhone: phone ? maskPhone(phone) : null,
    hasEmail,
    hasPhone,
  };
}

export type RequestOtpResult = {
  success: boolean;
  channel: PasswordResetChannel;
  destinationMasked: string;
  cooldownSeconds: number;
};

/**
 * Requests an OTP code sent via either Email (EmailJS) or Mobile SMS (Semaphore).
 * Enforces a strict 60-second cooldown timer.
 */
export async function requestPasswordResetOtp(
  profileId: string,
  channel: PasswordResetChannel
): Promise<RequestOtpResult> {
  // 1. Check cooldown
  const remaining = getRemainingCooldown(profileId);
  if (remaining > 0) {
    throw new Error(`Please wait ${remaining} second(s) before requesting a new OTP.`);
  }

  // 2. Get profile contact details
  let profile: any = null;
  const { data: profileWithPhone, error: phoneErr } = await supabase
    .from('profiles')
    .select('id, name, email, phone, avatar_url')
    .eq('id', profileId)
    .maybeSingle();

  if (!phoneErr && profileWithPhone) {
    profile = profileWithPhone;
  } else {
    // Fallback if column 'phone' does not exist in profiles schema
    const { data: profileFallback, error: fbErr } = await supabase
      .from('profiles')
      .select('id, name, email, avatar_url')
      .eq('id', profileId)
      .maybeSingle();

    if (fbErr || !profileFallback) {
      throw new Error('Account record could not be found.');
    }
    profile = profileFallback;
  }

  const email = profile.email ? profile.email.trim() : null;
  const phone = profile.phone
    ? profile.phone.trim()
    : profile.avatar_url?.startsWith('phone:')
    ? profile.avatar_url.replace('phone:', '').trim()
    : null;

  // 3. Generate 6-digit OTP
  let otpCode = Math.floor(100000 + Math.random() * 900000).toString();

  // 4. Dispatch OTP
  let destinationMasked = '';

  if (channel === 'sms') {
    if (!phone) {
      throw new Error(`No mobile number registered for ${profile.name}. Please select Email instead.`);
    }
    const sent = await sendSmsOtp({
      toPhone: phone,
      otpCode,
      facultyName: profile.name,
    });
    // Semaphore can return its own generated code — always verify against what was delivered
    if (sent.deliveredCode && /^\d{6}$/.test(sent.deliveredCode)) {
      otpCode = sent.deliveredCode;
    }
    destinationMasked = maskPhone(phone);
  } else {
    if (!email) {
      throw new Error(`No email address registered for ${profile.name}. Please select SMS instead.`);
    }
    await sendEmailOtp({
      toEmail: email,
      toName: profile.name,
      otpCode,
    });
    destinationMasked = maskEmail(email);
  }

  // 5. Store session with 10-minute expiry and 60-second cooldown
  otpSessions.set(profileId, {
    otp: otpCode,
    expiresAt: Date.now() + 10 * 60 * 1000,
    lastSentAt: Date.now(),
    cooldownUntil: Date.now() + 60 * 1000,
    channel,
    destination: channel === 'sms' ? phone! : email!,
    attempts: 0,
    adminUsername: adminUsernameByProfile.get(profileId) ?? null,
  });

  return {
    success: true,
    channel,
    destinationMasked,
    cooldownSeconds: 60,
  };
}

export type ResetPasswordResult = {
  success: boolean;
  message: string;
};

/**
 * Validates the OTP code and updates the password in both public.profiles and public.admins.
 */
export async function verifyOtpAndResetPassword(
  profileId: string,
  otpCode: string,
  newPassword: string
): Promise<ResetPasswordResult> {
  const cleanCode = otpCode.trim();
  const cleanPassword = newPassword.trim();

  if (cleanPassword.length < 6) {
    throw new Error('New password must be at least 6 characters long.');
  }

  const session = otpSessions.get(profileId);
  if (!session) {
    throw new Error('No active OTP request found. Please request a new verification code.');
  }

  if (Date.now() > session.expiresAt) {
    otpSessions.delete(profileId);
    throw new Error('The verification code has expired (10 minutes). Please request a new code.');
  }

  if (session.otp !== cleanCode) {
    session.attempts += 1;
    if (session.attempts >= MAX_OTP_ATTEMPTS) {
      otpSessions.delete(profileId);
      throw new Error('Too many wrong codes. Please request a new verification code.');
    }
    const left = MAX_OTP_ATTEMPTS - session.attempts;
    throw new Error(`Invalid verification code. ${left} attempt(s) left.`);
  }

  // 1. Fetch profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name, email')
    .eq('id', profileId)
    .single();

  // 2. Update profiles table
  const { error: profileUpdateErr } = await supabase
    .from('profiles')
    .update({
      password_plain: cleanPassword,
      updated_at: new Date().toISOString(),
    })
    .eq('id', profileId);

  if (profileUpdateErr) {
    console.warn('Could not update profiles.password_plain:', profileUpdateErr);
  }

  // 3. Update admins table if matching admin account exists
  if (profile) {
    try {
      if (session.adminUsername) {
        await supabase
          .from('admins')
          .update({ password: cleanPassword })
          .ilike('username', session.adminUsername);
      }
      if (profile.name) {
        await supabase
          .from('admins')
          .update({ password: cleanPassword })
          .ilike('username', profile.name);
      }
      if (profile.email) {
        await supabase
          .from('admins')
          .update({ password: cleanPassword })
          .ilike('username', profile.email);
      }
    } catch (adminSyncErr) {
      console.warn('Admins table sync warning:', adminSyncErr);
    }
  }

  // Clear OTP session
  otpSessions.delete(profileId);

  return {
    success: true,
    message: 'Your password has been reset successfully! You can now sign in with your new password.',
  };
}


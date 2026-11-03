import { env } from '../config/env';

export type SendSmsParams = {
  toPhone: string;
  otpCode: string;
  facultyName?: string;
};

export type SendEmailParams = {
  toEmail: string;
  toName: string;
  otpCode: string;
};

export type NotificationResult = {
  success: boolean;
  messageId?: string;
  error?: string;
};

/**
 * Normalizes a Philippine mobile number into standard 11-digit format (09XXXXXXXXX).
 */
export function normalizePhilippineMobile(rawPhone: string): string {
  const cleaned = rawPhone.replace(/[^\d+]/g, '');

  if (cleaned.startsWith('+63')) {
    return '0' + cleaned.slice(3);
  }
  if (cleaned.startsWith('63') && cleaned.length === 12) {
    return '0' + cleaned.slice(2);
  }
  if (cleaned.startsWith('9') && cleaned.length === 10) {
    return '0' + cleaned;
  }
  return cleaned;
}

/**
 * Validates whether a given mobile number is a valid Philippine mobile number.
 */
export function isValidPhilippineMobile(rawPhone: string): boolean {
  const normalized = normalizePhilippineMobile(rawPhone);
  return /^09\d{9}$/.test(normalized);
}

/**
 * Validates standard email address format.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Masks an email address for privacy (e.g. j****n@gmail.com).
 */
export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 1) return trimmed;
  const username = trimmed.substring(0, atIndex);
  const domain = trimmed.substring(atIndex);
  if (username.length <= 2) {
    return `${username[0]}***${domain}`;
  }
  return `${username[0]}${'*'.repeat(Math.min(username.length - 2, 4))}${username[username.length - 1]}${domain}`;
}

/**
 * Masks a phone number for privacy (e.g. 0917****567).
 */
export function maskPhone(phone: string): string {
  const norm = normalizePhilippineMobile(phone);
  if (norm.length >= 10) {
    return `${norm.slice(0, 4)}${'*'.repeat(norm.length - 7)}${norm.slice(-3)}`;
  }
  return phone;
}

/**
 * Dispatches a 6-digit OTP via Semaphore SMS API.
 */
export async function sendSmsOtp({
  toPhone,
  otpCode,
  facultyName,
}: SendSmsParams): Promise<NotificationResult> {
  const formattedNumber = normalizePhilippineMobile(toPhone);

  if (!isValidPhilippineMobile(formattedNumber)) {
    throw new Error(`Invalid mobile number (${toPhone}). Please use standard 11-digit PH mobile (09XXXXXXXXX).`);
  }

  const greeting = facultyName ? `Hello ${facultyName.trim()}, ` : '';
  const messageBody = `[CCS SmartLab] ${greeting}your password reset verification code is ${otpCode}. Valid for 10 minutes. Do not share this code.`;

  try {
    const payload: Record<string, string> = {
      apikey: env.semaphoreApiKey,
      number: formattedNumber,
      message: messageBody,
    };

    if (env.semaphoreSenderName) {
      payload.sendername = env.semaphoreSenderName;
    }

    const response = await fetch('https://api.semaphore.co/api/v4/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error('Semaphore API Error:', response.status, responseText);
      throw new Error(`Semaphore SMS service error (${response.status}): ${responseText}`);
    }

    let parsedData: unknown = null;
    try {
      parsedData = JSON.parse(responseText);
    } catch {
      // Non-JSON response
    }

    console.log('✅ SMS OTP dispatched successfully to', formattedNumber, parsedData);
    return {
      success: true,
      messageId: Array.isArray(parsedData) && parsedData[0]?.message_id ? String(parsedData[0].message_id) : undefined,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error sending SMS';
    console.error('Failed to send SMS OTP:', errorMsg);
    throw new Error(errorMsg);
  }
}

/**
 * Dispatches a 6-digit OTP via EmailJS API.
 */
export async function sendEmailOtp({
  toEmail,
  toName,
  otpCode,
}: SendEmailParams): Promise<NotificationResult> {
  const cleanEmail = toEmail.trim().toLowerCase();

  if (!isValidEmail(cleanEmail)) {
    throw new Error(`Invalid email address (${toEmail}).`);
  }

  const payload = {
    service_id: env.emailJsServiceId,
    template_id: env.emailJsTemplateId,
    user_id: env.emailJsPublicKey,
    template_params: {
      to_name: toName.trim() || 'Instructor',
      to_email: cleanEmail,
      email: cleanEmail,
      otp_code: otpCode,
      message: `Your one-time password (OTP) for password recovery is: ${otpCode}. This code is valid for 10 minutes.`,
      link: `OTP Verification Code: ${otpCode}`,
    },
  };

  try {
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error('EmailJS API Error:', response.status, responseText);
      throw new Error(`EmailJS service error (${response.status}): ${responseText}`);
    }

    console.log('✅ Email OTP dispatched successfully to', cleanEmail);
    return {
      success: true,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error sending Email';
    console.error('Failed to send Email OTP:', errorMsg);
    throw new Error(errorMsg);
  }
}


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
  /** The OTP that was actually delivered (Semaphore may generate its own). */
  deliveredCode?: string;
  /** Raw provider response, handy for debugging/testing. */
  raw?: unknown;
  error?: string;
};

/**
 * Normalizes a Philippine mobile number into standard 11-digit format (09XXXXXXXXX).
 */
export function normalizePhilippineMobile(rawPhone: string): string {
  const cleaned = (rawPhone || '').replace(/[^\d+]/g, '');

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
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());
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

function toFormBody(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

function describeSemaphoreError(status: number, body: unknown, rawText: string): string {
  // Semaphore returns validation errors as an object: { "number": ["..."], "sendername": ["..."] }
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const parts = Object.entries(body as Record<string, unknown>).map(([field, msgs]) => {
      const text = Array.isArray(msgs) ? msgs.join(' ') : String(msgs);
      return `${field}: ${text}`;
    });
    if (parts.length) return `Semaphore rejected the SMS (${status}) — ${parts.join(' | ')}`;
  }
  if (status === 401 || status === 403) {
    return 'Semaphore API key is invalid or the account is not allowed to send. Check EXPO_PUBLIC_SEMAPHORE_API_KEY.';
  }
  if (/credit|balance/i.test(rawText)) {
    return 'Semaphore account has no SMS credits left. Top up at semaphore.co.';
  }
  return `Semaphore SMS error (${status}): ${rawText.slice(0, 200) || 'empty response'}`;
}

async function postSemaphore(endpoint: 'otp' | 'messages', params: Record<string, string>) {
  const response = await fetch(`https://api.semaphore.co/api/v4/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: toFormBody(params),
  });
  const rawText = await response.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    parsed = null;
  }
  return { response, rawText, parsed };
}

/**
 * Dispatches a 6-digit OTP via the Semaphore OTP endpoint (priority route, made for OTPs).
 *
 * Fixes vs the old version:
 *  - uses form-encoded body (what Semaphore documents) and the /otp endpoint
 *  - a 200 response that is NOT a list of sent messages is treated as a failure
 *    (Semaphore reports validation errors like a bad sender name that way)
 *  - if the sender name is not approved for the account, retries with the default sender
 */
export async function sendSmsOtp({ toPhone, otpCode, facultyName }: SendSmsParams): Promise<NotificationResult> {
  const formattedNumber = normalizePhilippineMobile(toPhone);

  if (!isValidPhilippineMobile(formattedNumber)) {
    throw new Error(`Invalid mobile number (${toPhone}). Please use standard 11-digit PH mobile (09XXXXXXXXX).`);
  }
  if (!env.semaphoreApiKey) {
    throw new Error('SMS is not configured (missing EXPO_PUBLIC_SEMAPHORE_API_KEY).');
  }

  const greeting = facultyName ? `Hi ${facultyName.trim().split(/\s+/)[0]}, ` : '';
  // {otp} is replaced by Semaphore with `code`
  const message = `CCS SmartLab: ${greeting}your password reset code is {otp}. Valid for 10 minutes. Do not share this code.`;

  const base: Record<string, string> = {
    apikey: env.semaphoreApiKey,
    number: formattedNumber,
    message,
    code: otpCode,
  };

  const attempts: Record<string, string>[] = env.semaphoreSenderName
    ? [{ ...base, sendername: env.semaphoreSenderName }, base]
    : [base];

  let lastError = 'Unknown SMS error';
  for (let i = 0; i < attempts.length; i++) {
    try {
      const { response, rawText, parsed } = await postSemaphore('otp', attempts[i]);
      const first = Array.isArray(parsed) ? (parsed[0] as Record<string, unknown> | undefined) : undefined;

      if (response.ok && first && (first.message_id || first.status)) {
        const status = String(first.status || '').toLowerCase();
        if (status === 'failed' || status === 'refunded') {
          lastError = `Semaphore could not deliver the SMS (status: ${first.status}).`;
          break;
        }
        console.log('✅ SMS OTP queued via Semaphore for', maskPhone(formattedNumber), first.status);
        return {
          success: true,
          messageId: first.message_id ? String(first.message_id) : undefined,
          deliveredCode: first.code ? String(first.code) : otpCode,
          raw: parsed,
        };
      }

      lastError = describeSemaphoreError(response.status, parsed, rawText);
      const senderProblem = /sender ?name/i.test(rawText);
      if (!(senderProblem && i === 0 && attempts.length > 1)) break;
      console.warn('Semaphore sender name rejected — retrying with default sender.');
    } catch (err) {
      lastError = err instanceof Error ? `Network error reaching Semaphore: ${err.message}` : 'Network error reaching Semaphore';
      break;
    }
  }

  console.warn('Failed to send SMS OTP:', lastError);
  throw new Error(lastError);
}

function describeEmailJsError(status: number, text: string): string {
  if (/non-browser/i.test(text)) {
    return 'EmailJS blocks mobile apps by default. In EmailJS → Account → Security, turn ON "Allow EmailJS API for non-browser applications".';
  }
  if (/private key|access ?token/i.test(text)) {
    return 'EmailJS requires your Private Key. Set EXPO_PUBLIC_EMAILJS_PRIVATE_KEY in .env (EmailJS → Account → API keys).';
  }
  if (/template ID|template/i.test(text) && status === 400) {
    return `EmailJS template problem: ${text}. Check EXPO_PUBLIC_EMAILJS_TEMPLATE_ID.`;
  }
  if (/service ID|service/i.test(text) && status === 400) {
    return `EmailJS service problem: ${text}. Check EXPO_PUBLIC_EMAILJS_SERVICE_ID and that the Gmail service is connected.`;
  }
  if (/public key|user id/i.test(text)) {
    return `EmailJS public key problem: ${text}. Check EXPO_PUBLIC_EMAILJS_PUBLIC_KEY.`;
  }
  if (/recipients address is empty|recipient/i.test(text)) {
    return 'EmailJS template has no recipient. In the template settings set "To Email" to {{to_email}}.';
  }
  if (status === 429) {
    return 'EmailJS rate limit / monthly quota reached. Try again later.';
  }
  return `EmailJS error (${status}): ${text.slice(0, 200) || 'empty response'}`;
}

/**
 * Dispatches a 6-digit OTP via the EmailJS REST API.
 *
 * Template setup (EmailJS dashboard):
 *   To Email  : {{to_email}}
 *   Body uses : {{to_name}} {{otp_code}} (also {{message}} / {{passcode}} are sent)
 */
export async function sendEmailOtp({ toEmail, toName, otpCode }: SendEmailParams): Promise<NotificationResult> {
  const cleanEmail = toEmail.trim().toLowerCase();

  if (!isValidEmail(cleanEmail)) {
    throw new Error(`Invalid email address (${toEmail}).`);
  }
  if (!env.emailJsServiceId || !env.emailJsTemplateId || !env.emailJsPublicKey) {
    throw new Error('Email is not configured (missing EmailJS service/template/public key).');
  }

  const payload: Record<string, unknown> = {
    service_id: env.emailJsServiceId,
    template_id: env.emailJsTemplateId,
    user_id: env.emailJsPublicKey,
    template_params: {
      to_name: toName.trim() || 'Instructor',
      to_email: cleanEmail,
      email: cleanEmail,
      reply_to: cleanEmail,
      otp_code: otpCode,
      passcode: otpCode,
      time: '10 minutes',
      message: `Your one-time password (OTP) for password recovery is: ${otpCode}. This code is valid for 10 minutes.`,
      link: `OTP Verification Code: ${otpCode}`,
    },
  };
  if (env.emailJsPrivateKey) {
    payload.accessToken = env.emailJsPrivateKey;
  }

  let response: Response;
  let responseText = '';
  try {
    response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost',
      },
      body: JSON.stringify(payload),
    });
    responseText = await response.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Network error reaching EmailJS: ${msg}`);
  }

  // EmailJS answers exactly "OK" with HTTP 200 on success
  if (!response.ok || responseText.trim() !== 'OK') {
    const friendly = describeEmailJsError(response.status, responseText);
    console.warn('EmailJS API Error:', response.status, responseText);
    throw new Error(friendly);
  }

  console.log('✅ Email OTP dispatched to', maskEmail(cleanEmail));
  return { success: true, deliveredCode: otpCode, raw: responseText };
}

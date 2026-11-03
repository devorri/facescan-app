#!/usr/bin/env node
/**
 * OTP delivery self-test — uses the SAME requests the app makes.
 *
 *   node scripts/test-otp.mjs --check                       (no messages sent: verifies keys, credits, sender name)
 *   node scripts/test-otp.mjs --email you@gmail.com         (sends a test OTP email via EmailJS)
 *   node scripts/test-otp.mjs --phone 09171234567           (sends a test OTP SMS via Semaphore — uses 1-2 credits)
 *   node scripts/test-otp.mjs --check --email a@b.com --phone 0917...   (everything)
 *
 * Reads keys from .env (EXPO_PUBLIC_*), falls back to src/config/env.ts defaults.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const env = {};
  const envTs = fs.readFileSync(path.join(root, 'src/config/env.ts'), 'utf8');
  for (const m of envTs.matchAll(/process\.env\.(EXPO_PUBLIC_\w+)\s*\|\|\s*'([^']*)'/g)) env[m[1]] = m[2];
  const dotenv = path.join(root, '.env');
  if (fs.existsSync(dotenv)) {
    for (const line of fs.readFileSync(dotenv, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
  return env;
}

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const env = loadEnv();
const otp = String(Math.floor(100000 + Math.random() * 900000));
let failures = 0;
const ok = (m) => console.log(`  ✅ ${m}`);
const bad = (m) => { failures++; console.log(`  ❌ ${m}`); };

function normalizePH(raw) {
  const c = raw.replace(/[^\d+]/g, '');
  if (c.startsWith('+63')) return '0' + c.slice(3);
  if (c.startsWith('63') && c.length === 12) return '0' + c.slice(2);
  if (c.startsWith('9') && c.length === 10) return '0' + c;
  return c;
}

async function checkSemaphore() {
  console.log('\n[Semaphore] account check');
  const key = env.EXPO_PUBLIC_SEMAPHORE_API_KEY;
  if (!key) return bad('EXPO_PUBLIC_SEMAPHORE_API_KEY is empty');
  const acc = await fetch(`https://api.semaphore.co/api/v4/account?apikey=${key}`);
  const accText = await acc.text();
  if (!acc.ok) return bad(`API key rejected (${acc.status}): ${accText.slice(0, 200)}`);
  try {
    const a = JSON.parse(accText);
    ok(`API key valid — account "${a.account_name}", status ${a.status}, credits ${a.credit_balance}`);
    if (Number(a.credit_balance) <= 1) bad('Credit balance is too low to send SMS — top up on semaphore.co');
  } catch {
    ok(`API key valid (response: ${accText.slice(0, 120)})`);
  }
  const sn = await fetch(`https://api.semaphore.co/api/v4/account/sendernames?apikey=${key}`);
  const snText = await sn.text();
  const wanted = env.EXPO_PUBLIC_SEMAPHORE_SENDER_NAME;
  try {
    const names = JSON.parse(snText);
    const list = (Array.isArray(names) ? names : []).map((n) => `${n.name} (${n.status})`);
    console.log(`  ℹ️  sender names on account: ${list.join(', ') || 'none'}`);
    const match = (Array.isArray(names) ? names : []).find((n) => n.name === wanted);
    if (!wanted) ok('No sender name configured — Semaphore default sender will be used');
    else if (!match) bad(`Sender name "${wanted}" is NOT on this account — app will fall back to default sender`);
    else if (!/active|approved/i.test(match.status)) bad(`Sender name "${wanted}" status is "${match.status}" — not usable yet`);
    else ok(`Sender name "${wanted}" is approved`);
  } catch {
    console.log(`  ℹ️  sender names response: ${snText.slice(0, 200)}`);
  }
}

async function sendSms(phone) {
  console.log(`\n[Semaphore] sending test OTP SMS to ${phone}`);
  const number = normalizePH(phone);
  if (!/^09\d{9}$/.test(number)) return bad(`"${phone}" is not a valid PH mobile (09XXXXXXXXX)`);
  const base = {
    apikey: env.EXPO_PUBLIC_SEMAPHORE_API_KEY,
    number,
    message: 'CCS SmartLab: your password reset code is {otp}. Valid for 10 minutes. Do not share this code.',
    code: otp,
  };
  const attempts = env.EXPO_PUBLIC_SEMAPHORE_SENDER_NAME
    ? [{ ...base, sendername: env.EXPO_PUBLIC_SEMAPHORE_SENDER_NAME }, base]
    : [base];
  for (let i = 0; i < attempts.length; i++) {
    const res = await fetch('https://api.semaphore.co/api/v4/otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(attempts[i]).toString(),
    });
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* not json */ }
    const first = Array.isArray(parsed) ? parsed[0] : null;
    if (res.ok && first && (first.message_id || first.status)) {
      return ok(`Queued: message_id=${first.message_id} status=${first.status} code=${first.code ?? otp}` +
        (i === 1 ? ' (sent WITHOUT custom sender name)' : ''));
    }
    if (i === 0 && attempts.length > 1 && /sender ?name/i.test(text)) {
      console.log(`  ⚠️  sender name rejected (${text.slice(0, 150)}) — retrying with default sender`);
      continue;
    }
    return bad(`Semaphore rejected (${res.status}): ${text.slice(0, 300)}`);
  }
}

async function sendEmail(email) {
  console.log(`\n[EmailJS] sending test OTP email to ${email}`);
  const payload = {
    service_id: env.EXPO_PUBLIC_EMAILJS_SERVICE_ID,
    template_id: env.EXPO_PUBLIC_EMAILJS_TEMPLATE_ID,
    user_id: env.EXPO_PUBLIC_EMAILJS_PUBLIC_KEY,
    template_params: {
      to_name: 'Test User',
      to_email: email,
      email,
      reply_to: email,
      otp_code: otp,
      passcode: otp,
      time: '10 minutes',
      message: `Your one-time password (OTP) for password recovery is: ${otp}. This code is valid for 10 minutes.`,
      link: `OTP Verification Code: ${otp}`,
    },
  };
  if (env.EXPO_PUBLIC_EMAILJS_PRIVATE_KEY) payload.accessToken = env.EXPO_PUBLIC_EMAILJS_PRIVATE_KEY;
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (res.ok && text.trim() === 'OK') return ok(`EmailJS accepted the email (check inbox/spam for code ${otp})`);
  if (/non-browser/i.test(text)) return bad('EmailJS: turn ON "Allow EmailJS API for non-browser applications" in EmailJS → Account → Security');
  if (/private key|access ?token/i.test(text)) return bad('EmailJS needs the Private Key: add EXPO_PUBLIC_EMAILJS_PRIVATE_KEY=... to .env');
  return bad(`EmailJS rejected (${res.status}): ${text.slice(0, 300)}`);
}

(async () => {
  console.log(`OTP self-test — test code ${otp}`);
  try {
    if (args.includes('--check') || args.length === 0) await checkSemaphore();
    if (arg('--phone')) await sendSms(arg('--phone'));
    if (arg('--email')) await sendEmail(arg('--email'));
  } catch (e) {
    bad(`Network error: ${e.message}`);
  }
  console.log(failures ? `\n${failures} problem(s) found.` : '\nAll checks passed.');
  process.exit(failures ? 1 : 0);
})();

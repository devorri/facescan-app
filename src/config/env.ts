const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  'https://nbcoxrxywbrcjldccinr.supabase.co';

const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5iY294cnh5d2JyY2psZGNjaW5yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MDc1MTIsImV4cCI6MjA5OTE4MzUxMn0.BbPRDVKfCq0ov-EF2DW90E5OnwnGM4wBnTC-QLtzrSo';

const semaphoreApiKey =
  process.env.EXPO_PUBLIC_SEMAPHORE_API_KEY ||
  'f18fe7eb9f2f4b5477776b98d8b55565';

const semaphoreSenderName =
  process.env.EXPO_PUBLIC_SEMAPHORE_SENDER_NAME ||
  'TranslertPH';

const emailJsServiceId =
  process.env.EXPO_PUBLIC_EMAILJS_SERVICE_ID ||
  'service_bxgcocc';

const emailJsTemplateId =
  process.env.EXPO_PUBLIC_EMAILJS_TEMPLATE_ID ||
  'template_mjhzhvt';

const emailJsPublicKey =
  process.env.EXPO_PUBLIC_EMAILJS_PUBLIC_KEY ||
  'tTDzt3vF6T7t1eO-u';

export const env = {
  supabaseUrl,
  supabaseAnonKey,
  semaphoreApiKey,
  semaphoreSenderName,
  emailJsServiceId,
  emailJsTemplateId,
  emailJsPublicKey,
};

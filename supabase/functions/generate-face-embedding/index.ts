// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { imageBase64 } = await req.json();

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: 'imageBase64 field is required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const embedding = generateEmbeddingFromBase64(imageBase64);

    return new Response(
      JSON.stringify({ embedding }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

function generateEmbeddingFromBase64(base64Data: string): number[] {
  const embedding = new Array<number>(128);
  let hash1 = 5381;
  let hash2 = 52711;

  for (let i = 0; i < base64Data.length; i++) {
    const char = base64Data.charCodeAt(i);
    hash1 = ((hash1 << 5) + hash1) ^ char;
    hash2 = ((hash2 << 5) + hash2) ^ char;
  }

  let normSq = 0;
  for (let i = 0; i < 128; i++) {
    const seed = (hash1 * (i + 1) + hash2 * (i * 3 + 7)) % 2147483647;
    const val = (Math.abs(seed) % 20000 - 10000) / 10000;
    embedding[i] = val;
    normSq += val * val;
  }

  const norm = Math.sqrt(normSq) || 1;
  return embedding.map((v) => Number((v / norm).toFixed(6)));
}

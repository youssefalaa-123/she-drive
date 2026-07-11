import { verifyFirebaseToken, extractBearerToken } from '../_shared/firebaseAuth.ts';

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '';

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN ? origin : '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-firebase-token',
  };
}

async function sha1Hex(message: string): Promise<string> {
  const buf  = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest('SHA-1', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const token = extractBearerToken(req);
  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
  const caller = await verifyFirebaseToken(token);
  if (!caller) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  try {
    const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME');
    const apiKey    = Deno.env.get('CLOUDINARY_API_KEY');
    const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET');

    if (!cloudName || !apiKey || !apiSecret) {
      return new Response(
        JSON.stringify({ error: 'Cloudinary env vars not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...cors } },
      );
    }

    const { folder } = await req.json();
    if (!folder || typeof folder !== 'string' || !/^[\w/-]+$/.test(folder)) {
      return new Response(
        JSON.stringify({ error: 'Invalid folder' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...cors } },
      );
    }

    const timestamp = Math.round(Date.now() / 1000);
    const paramsToSign = `folder=${folder}&timestamp=${timestamp}`;
    const signature   = await sha1Hex(paramsToSign + apiSecret);

    return new Response(
      JSON.stringify({ signature, timestamp, api_key: apiKey, cloud_name: cloudName }),
      { headers: { 'Content-Type': 'application/json', ...cors } },
    );
  } catch (_) {
    return new Response(
      JSON.stringify({ error: 'Failed to generate upload signature' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...cors } },
    );
  }
});

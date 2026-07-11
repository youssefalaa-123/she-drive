/**
 * Verifies a Firebase ID token using Firebase's JWKS endpoint.
 * Returns { uid } on success, null on failure.
 */
export async function verifyFirebaseToken(token: string): Promise<{ uid: string } | null> {
  const projectId = Deno.env.get('FIREBASE_PROJECT_ID');
  if (!projectId) {
    console.error('[firebaseAuth] FIREBASE_PROJECT_ID env var not set');
    return null;
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, sigB64] = parts;
    const decode = (b64: string) =>
      JSON.parse(new TextDecoder().decode(
        Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
      ));

    const header  = decode(headerB64);
    const payload = decode(payloadB64);

    // Basic claim validation
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now)                                         return null;
    if (payload.iat > now + 300)                                   return null;
    if (payload.aud !== projectId)                                 return null;
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
    if (!payload.sub || typeof payload.sub !== 'string')           return null;

    // Fetch Firebase's RSA public keys as JWKS
    const jwksResp = await fetch(
      'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
      { headers: { 'Cache-Control': 'max-age=3600' } }
    );
    if (!jwksResp.ok) return null;
    const { keys } = await jwksResp.json() as { keys: any[] };
    const jwk = keys.find((k: any) => k.kid === header.kid);
    if (!jwk) return null;

    // Import public key and verify signature
    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signingInput = `${headerB64}.${payloadB64}`;
    const sigBytes = Uint8Array.from(
      atob(sigB64.replace(/-/g, '+').replace(/_/g, '/')),
      c => c.charCodeAt(0)
    );

    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      sigBytes,
      new TextEncoder().encode(signingInput)
    );

    return valid ? { uid: payload.sub } : null;
  } catch (err) {
    console.error('[firebaseAuth] Verification error:', err);
    return null;
  }
}

/** Extracts a Bearer token from the Authorization header. */
export function extractBearerToken(req: Request): string | null {
  const auth = req.headers.get('Authorization') ?? req.headers.get('x-firebase-token');
  if (!auth) return null;
  const [scheme, token] = auth.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

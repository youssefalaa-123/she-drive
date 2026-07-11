/**
 * Minimal Firestore REST API helper using a Firebase service account.
 *
 * Required Supabase secrets:
 *   FIREBASE_PROJECT_ID          — e.g. "she-drive-89e9e"
 *   FIREBASE_SERVICE_ACCOUNT_JSON — full JSON string of the service account key
 *     (Firebase Console → Project Settings → Service Accounts → Generate new private key)
 */

const PROJECT_ID = Deno.env.get('FIREBASE_PROJECT_ID') ?? '';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

/** Sign a Google service-account JWT and exchange it for an OAuth2 access token. */
async function getAccessToken(): Promise<string> {
  const raw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON env var not set');

  const sa = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);

  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const header  = encode({ alg: 'RS256', typ: 'JWT' });
  const payload = encode({
    iss: sa.client_email,
    sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore',
  });

  const signingInput = `${header}.${payload}`;
  const pemBody = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const keyBytes = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const sigBytes = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const jwt = `${signingInput}.${sig}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!resp.ok) throw new Error(`OAuth token exchange failed: ${await resp.text()}`);
  const { access_token } = await resp.json();
  return access_token;
}

/** Read a Firestore document. Returns the fields object, or null if not found. */
export async function getDoc(path: string): Promise<Record<string, any> | null> {
  const token = await getAccessToken();
  const resp  = await fetch(`${BASE}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`Firestore getDoc failed: ${await resp.text()}`);
  const doc = await resp.json();
  return doc.fields ?? null;
}

/** Helper: convert a JS value to a Firestore Value proto. */
function toValue(v: unknown): Record<string, unknown> {
  if (v === null || v === undefined)      return { nullValue: null };
  if (typeof v === 'boolean')             return { booleanValue: v };
  if (typeof v === 'number')              return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string')              return { stringValue: v };
  if (v instanceof Date)                  return { timestampValue: v.toISOString() };
  if (typeof v === 'object')              return { mapValue: { fields: Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, toValue(val)])) } };
  return { stringValue: String(v) };
}

export type Write =
  | { type: 'increment'; path: string; field: string; amount: number }
  | { type: 'set'; path: string; fields: Record<string, unknown>; merge?: boolean }
  | { type: 'serverTimestamp'; path: string; field: string };

/** Commit a batch of writes atomically. */
export async function commitWrites(writes: Write[]): Promise<void> {
  const token = await getAccessToken();

  const firestoreWrites = writes.map((w) => {
    const docName = `projects/${PROJECT_ID}/databases/(default)/documents/${w.path}`;

    if (w.type === 'increment') {
      return {
        transform: {
          document: docName,
          fieldTransforms: [{
            fieldPath: w.field,
            increment: { doubleValue: w.amount },
          }],
        },
      };
    }

    if (w.type === 'serverTimestamp') {
      return {
        transform: {
          document: docName,
          fieldTransforms: [{
            fieldPath: w.field,
            setToServerValue: 'REQUEST_TIME',
          }],
        },
      };
    }

    // set / merge
    const fields = Object.fromEntries(
      Object.entries(w.fields).map(([k, v]) => [k, toValue(v)])
    );
    const result: Record<string, unknown> = {
      update: { name: docName, fields },
    };
    if (w.merge) {
      result.updateMask = { fieldPaths: Object.keys(w.fields) };
    }
    return result;
  });

  const resp = await fetch(`${BASE.replace('/documents', '')}:commit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ writes: firestoreWrites }),
  });

  if (!resp.ok) throw new Error(`Firestore commit failed: ${await resp.text()}`);
}

/** Read a raw Firestore field value from the proto fields map. */
export function readField(fields: Record<string, any>, key: string): unknown {
  const v = fields?.[key];
  if (!v) return undefined;
  if ('stringValue'    in v) return v.stringValue;
  if ('integerValue'   in v) return Number(v.integerValue);
  if ('doubleValue'    in v) return Number(v.doubleValue);
  if ('booleanValue'   in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue'      in v) return null;
  if ('mapValue'       in v) return v.mapValue.fields;
  return undefined;
}

import crypto from 'crypto';

export const OFFICIAL_OWNER_EMAIL = 'kurghinyanartyom2@gmail.com';
export const FIREBASE_PROJECT_ID = 'ungoogly-sorter-6v9wh';

// Read from environment; generate an ephemeral per-process secret if unset (never hardcode a static literal)
const EPHEMERAL_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');
export const getServerSecret = (): string =>
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16
    ? process.env.SESSION_SECRET.trim()
    : EPHEMERAL_FALLBACK_SECRET;

export interface ServerTokenPayload {
  userId: string;
  email: string;
  role: 'super_admin' | 'student';
  issuedAt: number;
  expiresAt: number;
}

export interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

export function createSignedSessionToken(userId: string, email: string): string {
  const cleanEmail = email.trim().toLowerCase();
  // STRICT: Only kurghinyanartyom2@gmail.com can EVER receive the super_admin role on the server
  const isOwner = cleanEmail === OFFICIAL_OWNER_EMAIL.toLowerCase();
  const role: 'super_admin' | 'student' = isOwner ? 'super_admin' : 'student';

  const payload: ServerTokenPayload = {
    userId,
    email: cleanEmail,
    role,
    issuedAt: Date.now(),
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
  };

  const payloadJson = JSON.stringify(payload);
  const payloadBase64 = Buffer.from(payloadJson).toString('base64url');
  const signature = crypto
    .createHmac('sha256', getServerSecret())
    .update(payloadBase64)
    .digest('base64url');

  return `${payloadBase64}.${signature}`;
}

export function verifySignedSessionToken(token: string): ServerTokenPayload | null {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [payloadBase64, signature] = parts;
    const expectedSig = crypto
      .createHmac('sha256', getServerSecret())
      .update(payloadBase64)
      .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const payloadJson = Buffer.from(payloadBase64, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson) as ServerTokenPayload;

    if (!payload.expiresAt || Date.now() > payload.expiresAt) {
      return null;
    }

    // Re-enforce role integrity: only OFFICIAL_OWNER_EMAIL can hold super_admin
    if (payload.role === 'super_admin' && payload.email.toLowerCase() !== OFFICIAL_OWNER_EMAIL.toLowerCase()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

// ============================================================================
// FIREBASE ID TOKEN RS256 VERIFICATION (Stateless, works on Vercel & Cloud Run)
// ============================================================================
const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let cachedCerts: Record<string, string> | null = null;
let cachedCertsExpiresAt = 0;

async function fetchGooglePublicCerts(): Promise<Record<string, string>> {
  if (cachedCerts && Date.now() < cachedCertsExpiresAt) {
    return cachedCerts;
  }

  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch Firebase public keys: HTTP ${res.status}`);
  }

  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : 3600 * 1000;

  const certs = (await res.json()) as Record<string, string>;
  cachedCerts = certs;
  cachedCertsExpiresAt = Date.now() + maxAgeMs;
  return certs;
}

export async function verifyFirebaseIdToken(
  idToken: string,
  projectId: string = FIREBASE_PROJECT_ID
): Promise<VerifiedFirebaseUser | null> {
  try {
    if (!idToken || typeof idToken !== 'string') return null;
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as {
      alg?: string;
      kid?: string;
    };

    if (header.alg !== 'RS256' || !header.kid) {
      return null;
    }

    const certs = await fetchGooglePublicCerts();
    const cert = certs[header.kid];
    if (!cert) {
      return null;
    }

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${headerB64}.${payloadB64}`);
    verifier.end();
    const isValidSig = verifier.verify(cert, signatureB64, 'base64url');
    if (!isValidSig) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      aud?: string;
      iss?: string;
      sub?: string;
      exp?: number;
      iat?: number;
      auth_time?: number;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    };

    const nowSec = Math.floor(Date.now() / 1000);
    if (
      payload.aud !== projectId ||
      payload.iss !== `https://securetoken.google.com/${projectId}` ||
      !payload.sub ||
      typeof payload.sub !== 'string' ||
      payload.sub.length > 128 ||
      !payload.exp ||
      payload.exp <= nowSec ||
      !payload.iat ||
      payload.iat > nowSec + 300
    ) {
      return null;
    }

    return {
      uid: payload.sub,
      email: (payload.email || '').trim().toLowerCase(),
      emailVerified: payload.email_verified === true,
      name: payload.name,
      picture: payload.picture,
    };
  } catch {
    return null;
  }
}

export function timingSafeStringMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

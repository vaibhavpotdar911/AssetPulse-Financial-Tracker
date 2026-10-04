/**
 * AssetPulse - Authentication & Session Management Service
 * 
 * Implements:
 * - Password hashing and verification via bcryptjs (salt rounds >= 10)
 * - Stateless JWT creation and verification via jose (Edge & Node runtime compatible)
 * - Session cookie options and serialization
 * - Session extraction from incoming HTTP requests
 */

import { SignJWT, jwtVerify } from 'jose';

// ============================================================================
// Types & Contracts
// ============================================================================

export interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
}

export interface SessionCookieOptions {
  name: string;
  value: string;
  httpOnly: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  path: string;
  maxAge: number;
  secure: boolean;
}

// ============================================================================
// Configuration & Constants
// ============================================================================

export const SESSION_COOKIE_NAME = 'assetpulse_session';
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 604,800 seconds (7 days)
export const BCRYPT_SALT_ROUNDS = 10;

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_MAX_AGE_SECONDS,
  secure: process.env.NODE_ENV === 'production',
};

/**
 * Derives the HMAC-SHA256 secret key for JWT signing & verification.
 * Enforces a fallback secret for local zero-config development.
 */
export function getJwtSecretKey(): Uint8Array {
  const secret =
    process.env.JWT_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    'assetpulse-super-secret-development-jwt-key-32chars';
  return new TextEncoder().encode(secret);
}

// ============================================================================
// 1. Password Hashing & Verification (Node Runtime via Dynamic Import)
// ============================================================================

/**
 * Hashes a plaintext password using bcryptjs with at least 10 salt rounds.
 * Dynamically imports bcryptjs to prevent bundling Node dependencies into Edge Middleware.
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }
  const bcrypt = await import(/* webpackIgnore: true */ 'bcryptjs');
  const mod = bcrypt.default || bcrypt;
  return mod.hash(password, BCRYPT_SALT_ROUNDS);
}

/**
 * Verifies a plaintext password against a stored bcrypt hash.
 * Returns false on mismatches or invalid inputs without throwing uncaught exceptions.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) {
    return false;
  }
  try {
    const bcrypt = await import(/* webpackIgnore: true */ 'bcryptjs');
    const mod = bcrypt.default || bcrypt;
    return await mod.compare(password, hash);
  } catch {
    return false;
  }
}

// ============================================================================
// 2. JWT Session Token Creation & Verification (Universal Edge & Node via jose)
// ============================================================================

/**
 * Creates a signed JWT session token for the authenticated user with a 7-day tenure.
 */
export async function createSessionToken(user: SessionUser): Promise<string> {
  const secretKey = getJwtSecretKey();

  return new SignJWT({
    id: user.id,
    email: user.email,
    name: user.name ?? null,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secretKey);
}

/**
 * Verifies a JWT session token and returns the decoded SessionUser.
 * Returns null if the token is expired, tampered, malformed, or missing required fields.
 */
export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  if (!token || typeof token !== 'string') {
    return null;
  }

  try {
    const secretKey = getJwtSecretKey();
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ['HS256'],
    });

    const id = (payload.id as string) || (payload.sub as string);
    const email = payload.email as string;

    if (!id || !email) {
      return null;
    }

    return {
      id,
      email,
      name: payload.name ? String(payload.name) : null,
    };
  } catch {
    // Catches JWSInvalid, JWTExpired, JWSSignatureVerificationFailed, etc.
    return null;
  }
}

// ============================================================================
// 3. Session Cookie Management Helpers
// ============================================================================

/**
 * Returns cookie options matching production security standards.
 */
export function getSessionCookieOptions(token: string): SessionCookieOptions {
  return {
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === 'production',
  };
}

/**
 * Returns cookie options to invalidate and clear the session cookie.
 */
export function getClearSessionCookieOptions(): SessionCookieOptions {
  return {
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    secure: process.env.NODE_ENV === 'production',
  };
}

/**
 * Serializes the session cookie into a raw `Set-Cookie` header string.
 */
export function serializeSessionCookie(token: string): string {
  const isProd = process.env.NODE_ENV === 'production';
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax${isProd ? '; Secure' : ''}`;
}

/**
 * Serializes the clear session cookie into a raw `Set-Cookie` header string.
 */
export function serializeClearSessionCookie(): string {
  const isProd = process.env.NODE_ENV === 'production';
  return `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax${isProd ? '; Secure' : ''}`;
}

// ============================================================================
// 4. Request Session Extraction Helper
// ============================================================================

/**
 * Extracts and verifies the session user from an incoming Request or NextRequest.
 * Supports cookies and Bearer tokens for flexibility.
 */
export async function getSessionFromRequest(req: Request): Promise<SessionUser | null> {
  let token: string | undefined;

  // 1. NextRequest cookie map
  if ('cookies' in req && typeof (req as any).cookies?.get === 'function') {
    token = (req as any).cookies.get(SESSION_COOKIE_NAME)?.value;
  }

  // 2. Standard Cookie header parser
  if (!token) {
    const cookieHeader = req.headers.get('cookie');
    if (cookieHeader) {
      const match = cookieHeader
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
      if (match) {
        token = match.substring(SESSION_COOKIE_NAME.length + 1);
      }
    }
  }

  // 3. Fallback: Authorization Bearer header
  if (!token) {
    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      token = authHeader.substring(7).trim();
    }
  }

  if (!token) {
    return null;
  }

  return verifySessionToken(token);
}

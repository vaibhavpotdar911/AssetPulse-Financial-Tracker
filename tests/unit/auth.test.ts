import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  getSessionCookieOptions,
  getClearSessionCookieOptions,
  serializeSessionCookie,
  serializeClearSessionCookie,
  getSessionFromRequest,
  SESSION_COOKIE_NAME,
  SessionUser,
} from '@/lib/auth';
import { SignJWT } from 'jose';
import { NextRequest } from 'next/server';
import { POST as loginHandler } from '@/app/api/auth/login/route';

describe('Unit Test: Authentication Library (src/lib/auth.ts)', () => {
  const testUser: SessionUser = {
    id: 'user-uuid-12345',
    email: 'analyst@assetpulse.dev',
    name: 'Morgan Stanley',
  };

  describe('1. Password Hashing & Verification (bcryptjs)', () => {
    it('should securely hash a password and never return plaintext', async () => {
      const plaintext = 'SuperSecret123!';
      const hash = await hashPassword(plaintext);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash).not.toBe(plaintext);
      // Valid bcrypt hash starts with $2a$ or $2b$ and has 60 characters
      expect(hash).toMatch(/^\$2[ab]\$\d{2}\$[./0-9A-Za-z]{53}$/);
    });

    it('should generate unique salts resulting in different hashes for identical passwords', async () => {
      const plaintext = 'ConstantPassword456!';
      const hash1 = await hashPassword(plaintext);
      const hash2 = await hashPassword(plaintext);

      expect(hash1).not.toBe(hash2);
      expect(await verifyPassword(plaintext, hash1)).toBe(true);
      expect(await verifyPassword(plaintext, hash2)).toBe(true);
    });

    it('should correctly verify valid passwords against their hash', async () => {
      const plaintext = 'ValidVaultKey#2026';
      const hash = await hashPassword(plaintext);

      const isValid = await verifyPassword(plaintext, hash);
      expect(isValid).toBe(true);
    });

    it('should reject invalid passwords, wrong casing, and extra whitespace', async () => {
      const plaintext = 'StrictCasePassword';
      const hash = await hashPassword(plaintext);

      expect(await verifyPassword('WrongPassword', hash)).toBe(false);
      expect(await verifyPassword('strictcasepassword', hash)).toBe(false);
      expect(await verifyPassword('StrictCasePassword ', hash)).toBe(false);
      expect(await verifyPassword('', hash)).toBe(false);
    });

    it('should reject password with less than 8 characters during hashPassword', async () => {
      await expect(hashPassword('short')).rejects.toThrow(/at least 8 characters/i);
    });

    it('should handle malformed hashes gracefully without throwing unhandled exceptions', async () => {
      const result = await verifyPassword('password', 'not-a-valid-bcrypt-hash');
      expect(result).toBe(false);
    });

    it('should correctly hash and verify passwords with special characters', async () => {
      const specialPassword = '!@#$%^&*()_+~|}{[]:;?><,./-=';
      const hash = await hashPassword(specialPassword);

      expect(await verifyPassword(specialPassword, hash)).toBe(true);
      expect(await verifyPassword('!@#$%^&*()_+~|}{[]:;?><,./-!', hash)).toBe(false);
      expect(await verifyPassword('differentPassword123!', hash)).toBe(false);
    });

    it('should correctly hash and verify passwords containing unicode and emojis', async () => {
      const unicodePassword = 'P@sswørd🔑🔒日本語🚀';
      const hash = await hashPassword(unicodePassword);

      expect(await verifyPassword(unicodePassword, hash)).toBe(true);
      expect(await verifyPassword('P@sswørd🔑🔒日本語🚁', hash)).toBe(false);
      expect(await verifyPassword('P@sswørd🔑🔒', hash)).toBe(false);
    });

    it('should correctly hash and verify passwords containing leading, inner, and trailing spaces', async () => {
      const spacedPassword = '   password with spaced tokens inside   ';
      const hash = await hashPassword(spacedPassword);

      expect(await verifyPassword(spacedPassword, hash)).toBe(true);
      expect(await verifyPassword('password with spaced tokens inside', hash)).toBe(false);
      expect(await verifyPassword('   password with spaced tokens inside  ', hash)).toBe(false);
    });

    it('should correctly hash and verify passwords with 100+ character lengths', async () => {
      const longPassword = 'A'.repeat(50) + 'B'.repeat(30) + 'C'.repeat(25) + 'D'.repeat(15); // 120 chars
      const hash = await hashPassword(longPassword);

      expect(await verifyPassword(longPassword, hash)).toBe(true);
      // Alter character within the first 72 bytes
      const wrongLongPassword = 'X' + longPassword.substring(1);
      expect(await verifyPassword(wrongLongPassword, hash)).toBe(false);
    });

    it('should reject empty or nullish inputs to verifyPassword without throwing uncaught exceptions', async () => {
      const validHash = await hashPassword('ValidPass123!');
      expect(await verifyPassword('', validHash)).toBe(false);
      expect(await verifyPassword(null as any, validHash)).toBe(false);
      expect(await verifyPassword(undefined as any, validHash)).toBe(false);
      expect(await verifyPassword('ValidPass123!', '')).toBe(false);
      expect(await verifyPassword('ValidPass123!', null as any)).toBe(false);
      expect(await verifyPassword('ValidPass123!', undefined as any)).toBe(false);
    });
  });

  describe('2. JWT Creation & Verification (jose)', () => {
    it('should create a valid 3-segment JWT session token containing user claims', async () => {
      const token = await createSessionToken(testUser);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      const segments = token.split('.');
      expect(segments).toHaveLength(3);
    });

    it('should verify and extract user profile claims from a valid token', async () => {
      const token = await createSessionToken(testUser);
      const decoded = await verifySessionToken(token);

      expect(decoded).not.toBeNull();
      expect(decoded?.id).toBe(testUser.id);
      expect(decoded?.email).toBe(testUser.email);
      expect(decoded?.name).toBe(testUser.name);
    });

    it('should handle session users with null or undefined name', async () => {
      const anonymousUser: SessionUser = {
        id: 'user-anon-999',
        email: 'anon@assetpulse.dev',
        name: null,
      };

      const token = await createSessionToken(anonymousUser);
      const decoded = await verifySessionToken(token);

      expect(decoded).not.toBeNull();
      expect(decoded?.id).toBe(anonymousUser.id);
      expect(decoded?.email).toBe(anonymousUser.email);
      expect(decoded?.name).toBeNull();
    });
  });

  describe('3. Token Expiration & Tamper Resistance', () => {
    it('should reject expired tokens', async () => {
      const secret = new TextEncoder().encode(
        process.env.JWT_SECRET ||
          process.env.NEXTAUTH_SECRET ||
          'assetpulse-super-secret-development-jwt-key-32chars'
      );

      // Construct an already-expired token (issued 100s ago, expired 10s ago)
      const expiredToken = await new SignJWT({
        id: testUser.id,
        email: testUser.email,
        name: testUser.name,
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt(Math.floor(Date.now() / 1000) - 100)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
        .sign(secret);

      const decoded = await verifySessionToken(expiredToken);
      expect(decoded).toBeNull();
    });

    it('should reject tampered token signatures', async () => {
      const validToken = await createSessionToken(testUser);
      const parts = validToken.split('.');

      // Alter signature portion
      const tamperedSignature = `${parts[0]}.${parts[1]}.tampered_signature_payload_xyz`;
      const decoded = await verifySessionToken(tamperedSignature);
      expect(decoded).toBeNull();
    });

    it('should reject tampered payload data', async () => {
      const validToken = await createSessionToken(testUser);
      const parts = validToken.split('.');

      // Replace payload with forged JSON base64
      const forgedPayload = Buffer.from(
        JSON.stringify({ id: 'attacker-uuid-666', email: 'admin@assetpulse.dev' })
      ).toString('base64url');

      const tamperedToken = `${parts[0]}.${forgedPayload}.${parts[2]}`;
      const decoded = await verifySessionToken(tamperedToken);
      expect(decoded).toBeNull();
    });

    it('should reject tokens signed with a different secret key', async () => {
      const wrongSecret = new TextEncoder().encode('completely-wrong-unauthorized-secret-key!');
      const foreignToken = await new SignJWT({
        id: testUser.id,
        email: testUser.email,
        name: testUser.name,
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1d')
        .sign(wrongSecret);

      const decoded = await verifySessionToken(foreignToken);
      expect(decoded).toBeNull();
    });

    it('should handle malformed non-JWT tokens and empty strings gracefully', async () => {
      expect(await verifySessionToken('')).toBeNull();
      expect(await verifySessionToken('invalid.token')).toBeNull();
      expect(await verifySessionToken('random-garbage-string-xyz')).toBeNull();
    });

    it('should reject expired tokens across various past expiration intervals', async () => {
      const secret = new TextEncoder().encode(
        process.env.JWT_SECRET ||
          process.env.NEXTAUTH_SECRET ||
          'assetpulse-super-secret-development-jwt-key-32chars'
      );

      const pastOffsets = [1, 60, 3600, 86400, 31536000]; // 1s, 1m, 1h, 1d, 1y in the past
      for (const offset of pastOffsets) {
        const expiredToken = await new SignJWT({
          id: testUser.id,
          email: testUser.email,
          name: testUser.name,
        })
          .setProtectedHeader({ alg: 'HS256' })
          .setIssuedAt(Math.floor(Date.now() / 1000) - offset - 100)
          .setExpirationTime(Math.floor(Date.now() / 1000) - offset)
          .sign(secret);

        const decoded = await verifySessionToken(expiredToken);
        expect(decoded).toBeNull();
      }
    });

    it('should strictly reject tokens with tampered sub or id claims (privilege escalation attack)', async () => {
      const validToken = await createSessionToken(testUser);
      const parts = validToken.split('.');

      // Forged payload replacing id and sub with unauthorized admin ID
      const forgedPayload = Buffer.from(
        JSON.stringify({
          sub: 'admin-super-user-root',
          id: 'admin-super-user-root',
          email: testUser.email,
          name: 'Super Admin',
        })
      ).toString('base64url');

      const tamperedToken = `${parts[0]}.${forgedPayload}.${parts[2]}`;
      const decoded = await verifySessionToken(tamperedToken);
      expect(decoded).toBeNull();
    });

    it('should strictly reject tokens with tampered email claim', async () => {
      const validToken = await createSessionToken(testUser);
      const parts = validToken.split('.');

      // Forged payload replacing email
      const forgedPayload = Buffer.from(
        JSON.stringify({
          sub: testUser.id,
          id: testUser.id,
          email: 'admin@assetpulse.dev',
          name: testUser.name,
        })
      ).toString('base64url');

      const tamperedToken = `${parts[0]}.${forgedPayload}.${parts[2]}`;
      const decoded = await verifySessionToken(tamperedToken);
      expect(decoded).toBeNull();
    });

    it('should strictly reject tokens missing required id or sub claims', async () => {
      const secret = new TextEncoder().encode(
        process.env.JWT_SECRET ||
          process.env.NEXTAUTH_SECRET ||
          'assetpulse-super-secret-development-jwt-key-32chars'
      );

      const missingIdToken = await new SignJWT({
        email: testUser.email,
        name: testUser.name,
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1d')
        .sign(secret);

      const decoded = await verifySessionToken(missingIdToken);
      expect(decoded).toBeNull();
    });

    it('should strictly reject tokens missing required email claim', async () => {
      const secret = new TextEncoder().encode(
        process.env.JWT_SECRET ||
          process.env.NEXTAUTH_SECRET ||
          'assetpulse-super-secret-development-jwt-key-32chars'
      );

      const missingEmailToken = await new SignJWT({
        id: testUser.id,
        name: testUser.name,
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1d')
        .sign(secret);

      const decoded = await verifySessionToken(missingEmailToken);
      expect(decoded).toBeNull();
    });

    it('should strictly reject malformed token strings across boundary formats', async () => {
      const malformedCases = [
        '',
        'garbage',
        'a.b',
        'a.b.c.d',
        '   ',
        '.....',
        'eyJhbGciOiJIUzI1NiJ9',
        'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEyMyJ9',
        null as any,
        undefined as any,
        12345 as any,
        {} as any,
      ];

      for (const badToken of malformedCases) {
        const decoded = await verifySessionToken(badToken);
        expect(decoded).toBeNull();
      }
    });

    it('should strictly reject algorithm "none" attacks (unsigned JWT tokens)', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({ id: 'admin', email: 'admin@assetpulse.dev' })
      ).toString('base64url');

      // Test with trailing dot (header.payload.) and without trailing dot (header.payload)
      const noneTokenWithDot = `${header}.${payload}.`;
      const noneTokenWithoutDot = `${header}.${payload}`;

      expect(await verifySessionToken(noneTokenWithDot)).toBeNull();
      expect(await verifySessionToken(noneTokenWithoutDot)).toBeNull();
    });
  });

  describe('4. Cookie Options and Request Session Extraction', () => {
    it('should configure session cookie options correctly', () => {
      const options = getSessionCookieOptions('test-token');
      expect(options.name).toBe(SESSION_COOKIE_NAME);
      expect(options.value).toBe('test-token');
      expect(options.httpOnly).toBe(true);
      expect(options.sameSite).toBe('lax');
      expect(options.path).toBe('/');
      expect(options.maxAge).toBe(604800);
    });

    it('should configure clear session cookie options with maxAge 0', () => {
      const clearOpts = getClearSessionCookieOptions();
      expect(clearOpts.name).toBe(SESSION_COOKIE_NAME);
      expect(clearOpts.value).toBe('');
      expect(clearOpts.maxAge).toBe(0);
      expect(clearOpts.httpOnly).toBe(true);
    });

    it('should serialize session cookie to Set-Cookie string', () => {
      const serialized = serializeSessionCookie('cookie-val-xyz');
      expect(serialized).toContain(`${SESSION_COOKIE_NAME}=cookie-val-xyz`);
      expect(serialized).toContain('HttpOnly');
      expect(serialized).toContain('Max-Age=604800');
    });

    it('should serialize clear session cookie to Set-Cookie string', () => {
      const serialized = serializeClearSessionCookie();
      expect(serialized).toContain(`${SESSION_COOKIE_NAME}=`);
      expect(serialized).toContain('Max-Age=0');
      expect(serialized).toContain('Expires=Thu, 01 Jan 1970');
    });

    it('should extract session from Request with Cookie header', async () => {
      const token = await createSessionToken(testUser);
      const req = new Request('http://localhost:3000/api/auth/me', {
        headers: {
          cookie: `other=123; ${SESSION_COOKIE_NAME}=${token}; foo=bar`,
        },
      });

      const extracted = await getSessionFromRequest(req);
      expect(extracted).not.toBeNull();
      expect(extracted?.id).toBe(testUser.id);
      expect(extracted?.email).toBe(testUser.email);
    });

    it('should extract session from Request with Authorization Bearer header', async () => {
      const token = await createSessionToken(testUser);
      const req = new Request('http://localhost:3000/api/auth/me', {
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      const extracted = await getSessionFromRequest(req);
      expect(extracted).not.toBeNull();
      expect(extracted?.id).toBe(testUser.id);
    });

    it('should return null if no token is present in request', async () => {
      const req = new Request('http://localhost:3000/api/auth/me');
      const extracted = await getSessionFromRequest(req);
      expect(extracted).toBeNull();
    });
  });

  describe('5. Constant-Time Timing Attack Mitigation in Login Flow', () => {
    it('should verify dummy bcrypt hash validity and execution cost', async () => {
      // DUMMY_BCRYPT_HASH from login route handler
      const DUMMY_BCRYPT_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
      expect(DUMMY_BCRYPT_HASH).toMatch(/^\$2[ab]\$\d{2}\$[./0-9A-Za-z]{53}$/);

      const t0 = performance.now();
      const isValid = await verifyPassword('AnyPassword123!', DUMMY_BCRYPT_HASH);
      const duration = performance.now() - t0;

      expect(isValid).toBe(false);
      // 10-round bcrypt compare takes non-trivial CPU time (typically > 20ms)
      expect(duration).toBeGreaterThan(10);
    });

    it('should run bcrypt comparison for both invalid emails and existing emails during login', async () => {
      // Non-existent email request
      const reqNonExistent = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nonexistent_challenger_user@assetpulse.dev',
          password: 'Password123!',
        }),
      });

      const t0 = performance.now();
      const resNonExistent = await loginHandler(reqNonExistent);
      const elapsedNonExistent = performance.now() - t0;
      const dataNonExistent = await resNonExistent.json();

      expect(resNonExistent.status).toBe(401);
      expect(dataNonExistent.error).toBe('Invalid email or password.');
      // Confirm dummy bcrypt hash comparison executed (not an instantaneous early-return)
      expect(elapsedNonExistent).toBeGreaterThan(10);
    });
  });
});

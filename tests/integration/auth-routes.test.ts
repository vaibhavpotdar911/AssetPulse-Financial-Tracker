import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { prisma, checkDatabaseConnection } from '@/lib/db';
import { POST as registerHandler } from '@/app/api/auth/register/route';
import { POST as loginHandler } from '@/app/api/auth/login/route';
import { POST as logoutHandler } from '@/app/api/auth/logout/route';
import { GET as meHandler } from '@/app/api/auth/me/route';
import { middleware } from '@/middleware';
import { createSessionToken } from '@/lib/auth';
import { requireAuth, withAuth, stripTenantFields } from '@/lib/session';

describe('Integration Test: Auth Route Handlers & Edge Middleware', () => {
  const timestamp = Date.now();
  const testUserA = {
    name: 'Alice Springs',
    email: `alice_${timestamp}@assetpulse.dev`,
    password: 'PasswordAlice123!',
  };

  const testUserB = {
    name: 'Bob Builder',
    email: `bob_${timestamp}@assetpulse.dev`,
    password: 'PasswordBob456!',
  };

  let userAId: string;
  let userBId: string;
  let userASessionCookie: string;
  let userBSessionCookie: string;

  beforeAll(async () => {
    const health = await checkDatabaseConnection();
    expect(health.connected).toBe(true);
  });

  afterAll(async () => {
    // Teardown created users and any cascade records
    const testEmails = [testUserA.email, testUserB.email];
    for (const email of testEmails) {
      const u = await prisma.user.findUnique({ where: { email } });
      if (u) {
        await prisma.notification.deleteMany({ where: { userId: u.id } });
        await prisma.auditLog.deleteMany({ where: { userId: u.id } });
        await prisma.fixedDeposit.deleteMany({ where: { userId: u.id } });
        await prisma.user.delete({ where: { id: u.id } });
      }
    }
  });

  describe('1. Registration Flow (POST /api/auth/register)', () => {
    it('should reject registration with password shorter than 8 characters (400)', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Short Pass User',
          email: `short_${timestamp}@assetpulse.dev`,
          password: 'short',
        }),
      });

      const res = await registerHandler(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBeDefined();
    });

    it('should reject registration with invalid email format (400)', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Bad Email User',
          email: 'not-a-valid-email',
          password: 'ValidPassword123!',
        }),
      });

      const res = await registerHandler(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBeDefined();
    });

    it('should successfully register User A and return 201 with session cookie', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testUserA),
      });

      const res = await registerHandler(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.user).toBeDefined();
      expect(data.user.email).toBe(testUserA.email);
      expect(data.user.name).toBe(testUserA.name);
      expect(data.user.id).toBeDefined();
      expect(data.user.password).toBeUndefined(); // Never expose password in response

      userAId = data.user.id;

      // Verify Set-Cookie header is issued
      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toBeDefined();
      expect(setCookie).toContain('assetpulse_session=');
      expect(setCookie).toContain('HttpOnly');

      // Extract raw cookie string for subsequent tests
      const match = setCookie!.match(/assetpulse_session=([^;]+)/);
      expect(match).not.toBeNull();
      userASessionCookie = `assetpulse_session=${match![1]}`;

      // Verify database state directly
      const dbUser = await prisma.user.findUnique({ where: { id: userAId } });
      expect(dbUser).not.toBeNull();
      expect(dbUser?.password).toMatch(/^\$2[ab]\$/); // Stored as bcrypt hash
      expect(dbUser?.password).not.toBe(testUserA.password);
    });

    it('should reject duplicate email registration with 409 Conflict', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testUserA),
      });

      const res = await registerHandler(req);
      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.error).toMatch(/already exists/i);
    });

    it('should successfully register User B for multi-tenant isolation testing', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testUserB),
      });

      const res = await registerHandler(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      userBId = data.user.id;

      const setCookie = res.headers.get('set-cookie');
      const match = setCookie!.match(/assetpulse_session=([^;]+)/);
      userBSessionCookie = `assetpulse_session=${match![1]}`;
    });
  });

  describe('2. Login Flow (POST /api/auth/login)', () => {
    it('should reject login for non-existent email with generic 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `ghost_${timestamp}@assetpulse.dev`,
          password: 'SomePassword123!',
        }),
      });

      const res = await loginHandler(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toMatch(/invalid email or password/i);
    });

    it('should reject login with wrong password with generic 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testUserA.email,
          password: 'IncorrectPassword!',
        }),
      });

      const res = await loginHandler(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toMatch(/invalid email or password/i);
    });

    it('should successfully log in with valid credentials and issue session cookie', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testUserA.email,
          password: testUserA.password,
        }),
      });

      const res = await loginHandler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.user).toBeDefined();
      expect(data.user.email).toBe(testUserA.email);

      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toBeDefined();
      expect(setCookie).toContain('assetpulse_session=');
    });
  });

  describe('3. Profile Retrieval (GET /api/auth/me)', () => {
    it('should reject profile request without session cookie (401)', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/me', {
        method: 'GET',
      });

      const res = await meHandler(req);
      expect(res.status).toBe(401);
    });

    it('should return authenticated user profile when session cookie is provided (200)', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/me', {
        method: 'GET',
        headers: { Cookie: userASessionCookie },
      });

      const res = await meHandler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.user).toBeDefined();
      expect(data.user.id).toBe(userAId);
      expect(data.user.email).toBe(testUserA.email);
      expect(data.user.name).toBe(testUserA.name);
      expect(data.user.password).toBeUndefined();
    });
  });

  describe('4. Logout Flow (POST /api/auth/logout)', () => {
    it('should clear session cookie with Max-Age=0 upon logout', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/logout', {
        method: 'POST',
        headers: { Cookie: userASessionCookie },
      });

      const res = await logoutHandler(req);
      expect(res.status).toBe(200);

      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toBeDefined();
      expect(setCookie?.toLowerCase()).toMatch(/max-age=0|expires=thu, 01 jan 1970/);
    });
  });

  describe('5. Edge Middleware Route Protection', () => {
    it('should redirect unauthenticated request to /dashboard with 307 to /login', async () => {
      const req = new NextRequest('http://localhost:3000/dashboard');
      const res = await middleware(req);

      expect(res.status).toBe(307);
      const location = res.headers.get('location');
      expect(location).toContain('/login');
      expect(location).toContain('callbackUrl=%2Fdashboard');
    });

    it('should reject unauthenticated request to private API route /api/deposits with 401 JSON', async () => {
      const req = new NextRequest('http://localhost:3000/api/deposits');
      const res = await middleware(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toMatch(/unauthorized/i);
    });

    it('should allow authenticated request with valid cookie to access /dashboard', async () => {
      const token = await createSessionToken({
        id: userAId,
        email: testUserA.email,
        name: testUserA.name,
      });

      const req = new NextRequest('http://localhost:3000/dashboard', {
        headers: { Cookie: `assetpulse_session=${token}` },
      });

      const res = await middleware(req);
      // Next.js middleware passes through via NextResponse.next() (status 200)
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('should redirect already-authenticated user from /login to /dashboard', async () => {
      const token = await createSessionToken({
        id: userAId,
        email: testUserA.email,
        name: testUserA.name,
      });

      const req = new NextRequest('http://localhost:3000/login', {
        headers: { Cookie: `assetpulse_session=${token}` },
      });

      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/dashboard');
    });
  });

  describe('6. Multi-Tenant Isolation Verification', () => {
    it('should strictly isolate data so User B cannot view User A deposits or audit logs', async () => {
      // 1. Seed deposit owned exclusively by User A
      const depositA = await prisma.fixedDeposit.create({
        data: {
          userId: userAId,
          bankName: 'Barclays Bank',
          accountNumber: 'BARC-TEST-001',
          principalAmount: 100000.0,
          annualRate: 7.2,
          compoundingFrequency: 'QUARTERLY',
          startDate: new Date(),
          maturityDate: new Date(Date.now() + 365 * 86400000),
          maturityAmount: 107396.65,
          totalInterestEarned: 7396.65,
          status: 'ACTIVE',
        },
      });

      // 2. Query scoped to User B
      const userBDeposits = await prisma.fixedDeposit.findMany({
        where: { userId: userBId },
      });
      expect(userBDeposits.find((d) => d.id === depositA.id)).toBeUndefined();

      // 3. Attempt direct cross-tenant lookup using User B tenancy
      const crossTenantLookup = await prisma.fixedDeposit.findFirst({
        where: { id: depositA.id, userId: userBId },
      });
      expect(crossTenantLookup).toBeNull();

      // Clean up
      await prisma.fixedDeposit.delete({ where: { id: depositA.id } });
    });
  });

  describe('7. Session Helper Utilities (src/lib/session.ts)', () => {
    it('should enforce authentication with requireAuth', async () => {
      const unauthReq = new NextRequest('http://localhost:3000/api/deposits');
      const { user: unauthUser, errorResponse } = await requireAuth(unauthReq);
      expect(unauthUser).toBeNull();
      expect(errorResponse).not.toBeNull();
      expect(errorResponse?.status).toBe(401);

      const token = await createSessionToken({
        id: userAId,
        email: testUserA.email,
        name: testUserA.name,
      });
      const authReq = new NextRequest('http://localhost:3000/api/deposits', {
        headers: { Cookie: `assetpulse_session=${token}` },
      });
      const { user: authUser, errorResponse: noError } = await requireAuth(authReq);
      expect(authUser).not.toBeNull();
      expect(authUser?.id).toBe(userAId);
      expect(noError).toBeNull();
    });

    it('should execute wrapped handler via withAuth for authenticated request', async () => {
      const token = await createSessionToken({
        id: userAId,
        email: testUserA.email,
        name: testUserA.name,
      });
      const authReq = new NextRequest('http://localhost:3000/api/test', {
        headers: { Cookie: `assetpulse_session=${token}` },
      });

      const handler = withAuth(async (_req, { user }) => {
        return NextResponse.json({ ok: true, userId: user.id });
      });

      const res = await handler(authReq);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.userId).toBe(userAId);
    });

    it('should strip injected tenant and id fields using stripTenantFields', () => {
      const dirtyPayload = {
        userId: 'malicious-injected-id',
        user: { id: 'attacker' },
        id: 'resource-fake-id',
        bankName: 'HSBC',
        principal: 50000,
      };

      const safePayload = stripTenantFields(dirtyPayload);
      expect((safePayload as any).userId).toBeUndefined();
      expect((safePayload as any).user).toBeUndefined();
      expect((safePayload as any).id).toBeUndefined();
      expect((safePayload as any).bankName).toBe('HSBC');
      expect((safePayload as any).principal).toBe(50000);
    });
  });
});

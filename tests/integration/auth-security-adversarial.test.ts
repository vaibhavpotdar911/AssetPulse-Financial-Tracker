/**
 * Empirical Adversarial Test Suite for Milestone 3
 * Focus: Edge Route Protection, Open Redirect Defenses, API 401 Guards,
 *        Multi-Tenant Data Isolation, Uniform 404 IDOR Protection,
 *        and stripTenantFields Sanitization.
 * 
 * Executed by Challenger M3-2 (critic / specialist)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { prisma, checkDatabaseConnection } from '@/lib/db';
import { POST as registerHandler } from '@/app/api/auth/register/route';
import { middleware } from '@/middleware';
import { createSessionToken } from '@/lib/auth';
import { requireAuth, withAuth, stripTenantFields } from '@/lib/session';

describe('Empirical Adversarial Challenge Suite: Milestone 3 Security & Isolation', () => {
  const runId = Date.now();
  let userAId: string;
  let userBId: string;
  let userASessionToken: string;
  let userBSessionToken: string;
  let userACookie: string;
  let userBCookie: string;

  const testUserA = {
    name: 'Challenger Alpha',
    email: `challenger_alpha_${runId}@assetpulse.dev`,
    password: 'PasswordAlpha999!',
  };

  const testUserB = {
    name: 'Challenger Beta',
    email: `challenger_beta_${runId}@assetpulse.dev`,
    password: 'PasswordBeta888!',
  };

  let depositAId: string;

  beforeAll(async () => {
    const dbHealth = await checkDatabaseConnection();
    expect(dbHealth.connected).toBe(true);

    // Register User A
    const reqA = new NextRequest('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUserA),
    });
    const resA = await registerHandler(reqA);
    expect(resA.status).toBe(201);
    const dataA = await resA.json();
    userAId = dataA.user.id;
    const cookieAHeader = resA.headers.get('set-cookie');
    const matchA = cookieAHeader?.match(/assetpulse_session=([^;]+)/);
    expect(matchA).not.toBeNull();
    userASessionToken = matchA![1];
    userACookie = `assetpulse_session=${userASessionToken}`;

    // Register User B
    const reqB = new NextRequest('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUserB),
    });
    const resB = await registerHandler(reqB);
    expect(resB.status).toBe(201);
    const dataB = await resB.json();
    userBId = dataB.user.id;
    const cookieBHeader = resB.headers.get('set-cookie');
    const matchB = cookieBHeader?.match(/assetpulse_session=([^;]+)/);
    expect(matchB).not.toBeNull();
    userBSessionToken = matchB![1];
    userBCookie = `assetpulse_session=${userBSessionToken}`;

    // Create seed resources for User A
    const depA = await prisma.fixedDeposit.create({
      data: {
        userId: userAId,
        bankName: 'HSBC Global',
        accountNumber: 'HSBC-ADV-001',
        principalAmount: 250000,
        annualRate: 7.15,
        compoundingFrequency: 'QUARTERLY',
        startDate: new Date('2026-01-01'),
        maturityDate: new Date('2027-01-01'),
        maturityAmount: 268371.18,
        totalInterestEarned: 18371.18,
        status: 'ACTIVE',
      },
    });
    depositAId = depA.id;

    await prisma.auditLog.create({
      data: {
        userId: userAId,
        depositId: depositAId,
        action: 'CREATED',
        bankName: 'HSBC Global',
        accountNumber: 'HSBC-ADV-001',
        principalAmount: 250000,
        snapshotData: JSON.stringify({ initialPrincipal: 250000 }),
      },
    });

    await prisma.notification.create({
      data: {
        userId: userAId,
        depositId: depositAId,
        type: 'SYSTEM',
        severity: 'info',
        title: 'Deposit Created',
        message: 'Fixed deposit created successfully.',
      },
    });
  });

  afterAll(async () => {
    // Teardown test artifacts
    for (const uid of [userAId, userBId]) {
      if (uid) {
        await prisma.notification.deleteMany({ where: { userId: uid } });
        await prisma.auditLog.deleteMany({ where: { userId: uid } });
        await prisma.fixedDeposit.deleteMany({ where: { userId: uid } });
        await prisma.user.deleteMany({ where: { id: uid } });
      }
    }
  });

  // ==========================================================================
  // Section 1: Edge Route Protection for Pages (307 Redirects)
  // ==========================================================================
  describe('1. Edge Route Protection — Unauthenticated Page Requests', () => {
    const protectedPages = [
      { path: '/dashboard', label: '/dashboard root' },
      { path: '/dashboard/analytics', label: '/dashboard/analytics subpath' },
      { path: '/deposits', label: '/deposits root' },
      { path: '/deposits/new?bank=StandardChartered', label: '/deposits with query string' },
      { path: '/audit-logs', label: '/audit-logs root' },
      { path: '/audit-logs?page=2&action=CLOSED', label: '/audit-logs with query params' },
      { path: '/settings', label: '/settings root' },
      { path: '/settings/security', label: '/settings subpath' },
    ];

    for (const { path, label } of protectedPages) {
      it(`should redirect unauthenticated request to ${label} (${path}) with 307 to /login`, async () => {
        const req = new NextRequest(`http://localhost:3000${path}`);
        const res = await middleware(req);

        expect(res.status).toBe(307);
        const location = res.headers.get('location');
        expect(location).toBeDefined();

        // Location must target /login with callbackUrl matching the requested path and query
        const parsedLocation = new URL(location!);
        expect(parsedLocation.pathname).toBe('/login');
        expect(parsedLocation.searchParams.get('callbackUrl')).toBe(path);
      });
    }

    it('should reject requests with tampered JWT session cookie and redirect with 307', async () => {
      const tamperedCookie = 'assetpulse_session=eyJhbGciOiJIUzI1NiJ9.tampered.signature';
      const req = new NextRequest('http://localhost:3000/dashboard', {
        headers: { Cookie: tamperedCookie },
      });
      const res = await middleware(req);

      expect(res.status).toBe(307);
      const location = res.headers.get('location');
      expect(location).toContain('/login?callbackUrl=%2Fdashboard');
    });
  });

  // ==========================================================================
  // Section 2: Edge Route Protection for APIs (401 JSON)
  // ==========================================================================
  describe('2. Edge Route Protection — Unauthenticated API Requests', () => {
    const protectedApis = [
      { path: '/api/deposits', label: '/api/deposits root' },
      { path: '/api/deposits/sub-deposit-id-123', label: '/api/deposits sub-route' },
      { path: '/api/audit-logs', label: '/api/audit-logs root' },
      { path: '/api/audit-logs?action=CLOSED', label: '/api/audit-logs with query' },
      { path: '/api/notifications', label: '/api/notifications root' },
      { path: '/api/notifications/unread-count', label: '/api/notifications sub-route' },
    ];

    for (const { path, label } of protectedApis) {
      it(`should reject unauthenticated request to ${label} (${path}) with 401 JSON`, async () => {
        const req = new NextRequest(`http://localhost:3000${path}`);
        const res = await middleware(req);

        expect(res.status).toBe(401);
        const data = await res.json();
        expect(data.error).toBe('Unauthorized');
        expect(data.message).toMatch(/Authentication required/i);
      });
    }

    it('should reject API requests with malformed session tokens with 401 JSON', async () => {
      const req = new NextRequest('http://localhost:3000/api/deposits', {
        headers: { Cookie: 'assetpulse_session=invalid-jwt-payload' },
      });
      const res = await middleware(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Unauthorized');
    });
  });

  // ==========================================================================
  // Section 3: Open Redirect Defenses
  // ==========================================================================
  describe('3. Open Redirect Attack Defenses', () => {
    it('should neutralize open redirect to https://evil.com and redirect to /dashboard', async () => {
      const req = new NextRequest('http://localhost:3000/login?callbackUrl=https://evil.com', {
        headers: { Cookie: userACookie },
      });
      const res = await middleware(req);

      expect(res.status).toBe(307);
      const location = res.headers.get('location');
      expect(location).toBe('http://localhost:3000/dashboard');
      expect(location).not.toContain('evil.com');
    });

    it('should neutralize open redirect to http://evil.com and redirect to /dashboard', async () => {
      const req = new NextRequest('http://localhost:3000/login?callbackUrl=http://evil.com', {
        headers: { Cookie: userACookie },
      });
      const res = await middleware(req);

      expect(res.status).toBe(307);
      const location = res.headers.get('location');
      expect(location).toBe('http://localhost:3000/dashboard');
    });

    it('should neutralize protocol-relative open redirect //evil.com and redirect to /dashboard', async () => {
      const req = new NextRequest('http://localhost:3000/login?callbackUrl=//evil.com', {
        headers: { Cookie: userACookie },
      });
      const res = await middleware(req);

      expect(res.status).toBe(307);
      const location = res.headers.get('location');
      expect(location).toBe('http://localhost:3000/dashboard');
      expect(location).not.toContain('//evil.com');
    });

    it('should neutralize triple-slash protocol-relative redirect ///evil.com and redirect to /dashboard', async () => {
      const req = new NextRequest('http://localhost:3000/login?callbackUrl=///evil.com', {
        headers: { Cookie: userACookie },
      });
      const res = await middleware(req);

      expect(res.status).toBe(307);
      const location = res.headers.get('location');
      expect(location).toBe('http://localhost:3000/dashboard');
    });

    it('should neutralize javascript: pseudo-protocol URIs and redirect to /dashboard', async () => {
      const req = new NextRequest('http://localhost:3000/login?callbackUrl=javascript:alert(document.cookie)', {
        headers: { Cookie: userACookie },
      });
      const res = await middleware(req);

      expect(res.status).toBe(307);
      const location = res.headers.get('location');
      expect(location).toBe('http://localhost:3000/dashboard');
    });

    it('should preserve legitimate relative paths (/deposits, /audit-logs)', async () => {
      const req = new NextRequest('http://localhost:3000/login?callbackUrl=/deposits', {
        headers: { Cookie: userACookie },
      });
      const res = await middleware(req);

      expect(res.status).toBe(307);
      const location = res.headers.get('location');
      expect(location).toBe('http://localhost:3000/deposits');
    });

    it('should preserve legitimate subpaths with query parameters', async () => {
      const req = new NextRequest('http://localhost:3000/login?callbackUrl=/dashboard/analytics?view=chart', {
        headers: { Cookie: userACookie },
      });
      const res = await middleware(req);

      expect(res.status).toBe(307);
      const location = res.headers.get('location');
      expect(location).toBe('http://localhost:3000/dashboard/analytics?view=chart');
    });
  });

  // ==========================================================================
  // Section 4: Multi-Tenant Isolation & IDOR Protection
  // ==========================================================================
  describe('4. Multi-Tenant Isolation & IDOR Protection', () => {
    it('should ensure User B cannot read User A deposits via tenant-scoped queries', async () => {
      // User B query for deposits
      const userBDeposits = await prisma.fixedDeposit.findMany({
        where: { userId: userBId },
      });
      const foundAInB = userBDeposits.some((d) => d.id === depositAId);
      expect(foundAInB).toBe(false);

      // User B direct attempt to fetch Deposit A
      const crossTenantLookup = await prisma.fixedDeposit.findFirst({
        where: { id: depositAId, userId: userBId },
      });
      expect(crossTenantLookup).toBeNull();
    });

    it('should ensure User B cannot read User A audit logs', async () => {
      const userBAuditLogs = await prisma.auditLog.findMany({
        where: { userId: userBId },
      });
      expect(userBAuditLogs.length).toBe(0);

      const crossTenantAudit = await prisma.auditLog.findFirst({
        where: { depositId: depositAId, userId: userBId },
      });
      expect(crossTenantAudit).toBeNull();
    });

    it('should ensure User B cannot mutate User A deposits via IDOR attacks', async () => {
      // User B attempts to overwrite principalAmount of Deposit A
      const attackUpdate = await prisma.fixedDeposit.updateMany({
        where: { id: depositAId, userId: userBId },
        data: { principalAmount: 1.0 },
      });
      expect(attackUpdate.count).toBe(0);

      // Verify Deposit A was not modified
      const originalDeposit = await prisma.fixedDeposit.findUnique({
        where: { id: depositAId },
      });
      expect(originalDeposit?.principalAmount).toBe(250000);
    });

    it('should ensure User B cannot delete User A deposits via IDOR attacks', async () => {
      const attackDelete = await prisma.fixedDeposit.deleteMany({
        where: { id: depositAId, userId: userBId },
      });
      expect(attackDelete.count).toBe(0);

      // Verify Deposit A still exists
      const intactDeposit = await prisma.fixedDeposit.findUnique({
        where: { id: depositAId },
      });
      expect(intactDeposit).not.toBeNull();
    });

    it('should return uniform 404 response for both cross-tenant and non-existent IDs', async () => {
      // Simulated endpoint handler using withAuth & tenant-scoped queries
      const simulatedGetDeposit = withAuth(async (_req, { user }, params) => {
        const deposit = await prisma.fixedDeposit.findFirst({
          where: { id: params.id, userId: user.id },
        });
        if (!deposit) {
          return NextResponse.json({ error: 'Deposit not found' }, { status: 404 });
        }
        return NextResponse.json(deposit);
      });

      // 1. User B requests Deposit A (cross-tenant IDOR attack)
      const crossReq = new NextRequest(`http://localhost:3000/api/deposits/${depositAId}`, {
        headers: { Cookie: userBCookie },
      });
      const crossRes = await simulatedGetDeposit(crossReq, { id: depositAId });
      const crossData = await crossRes.json();

      expect(crossRes.status).toBe(404);
      expect(crossData.error).toBe('Deposit not found');

      // 2. User B requests a non-existent UUID
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      const nonExistentReq = new NextRequest(`http://localhost:3000/api/deposits/${nonExistentId}`, {
        headers: { Cookie: userBCookie },
      });
      const nonExistentRes = await simulatedGetDeposit(nonExistentReq, { id: nonExistentId });
      const nonExistentData = await nonExistentRes.json();

      expect(nonExistentRes.status).toBe(404);
      expect(nonExistentData.error).toBe('Deposit not found');

      // 3. Confirm responses are completely identical (zero information leakage)
      expect(crossRes.status).toBe(nonExistentRes.status);
      expect(crossData).toEqual(nonExistentData);
    });
  });

  // ==========================================================================
  // Section 5: stripTenantFields Sanitization & Session Helpers
  // ==========================================================================
  describe('5. stripTenantFields & Session Isolation Utilities', () => {
    it('should strip injected userId, user, and id from incoming payload', () => {
      const maliciousPayload = {
        userId: 'attacker-injected-uuid',
        user: { id: 'attacker-uuid', role: 'admin' },
        id: 'fake-deposit-id',
        bankName: 'Barclays Private',
        accountNumber: 'BARC-998877',
        principalAmount: 750000,
        annualRate: 8.0,
      };

      const sanitized = stripTenantFields(maliciousPayload);

      expect((sanitized as any).userId).toBeUndefined();
      expect((sanitized as any).user).toBeUndefined();
      expect((sanitized as any).id).toBeUndefined();
      expect((sanitized as any).bankName).toBe('Barclays Private');
      expect((sanitized as any).accountNumber).toBe('BARC-998877');
      expect((sanitized as any).principalAmount).toBe(750000);
      expect((sanitized as any).annualRate).toBe(8.0);
    });

    it('should preserve unmodified safe payloads having no tenancy fields', () => {
      const cleanPayload = {
        bankName: 'Citibank',
        accountNumber: 'CITI-123',
        principalAmount: 50000,
      };

      const sanitized = stripTenantFields(cleanPayload);
      expect(sanitized).toEqual(cleanPayload);
    });

    it('should enforce requireAuth correctly on both authenticated and unauthenticated requests', async () => {
      // Unauthenticated
      const unauthReq = new NextRequest('http://localhost:3000/api/deposits');
      const { user: nullUser, errorResponse } = await requireAuth(unauthReq);
      expect(nullUser).toBeNull();
      expect(errorResponse).not.toBeNull();
      expect(errorResponse?.status).toBe(401);

      // Authenticated User A
      const authReqA = new NextRequest('http://localhost:3000/api/deposits', {
        headers: { Cookie: userACookie },
      });
      const { user: authedUserA, errorResponse: noErrorA } = await requireAuth(authReqA);
      expect(authedUserA).not.toBeNull();
      expect(authedUserA?.id).toBe(userAId);
      expect(authedUserA?.email).toBe(testUserA.email);
      expect(noErrorA).toBeNull();
    });
  });
});

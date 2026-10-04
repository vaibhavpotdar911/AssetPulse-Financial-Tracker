/**
 * AssetPulse - Milestone 5 Adversarial Empirical Challenge Suite
 * File: tests/integration/notification-adversarial-challenge.test.ts
 * 
 * Conducts adversarial stress-testing across:
 * 1. Multi-Tenant Data Isolation & IDOR Vulnerabilities
 *    - Cross-tenant notification leakage (User A querying User B)
 *    - Cross-tenant notification mutation (User A marking User B notification read -> uniform 404)
 *    - Non-existent notification ID -> uniform 404 indistinguishable from IDOR
 *    - Bulk mark-all-read blast radius (User A mark-all-read does NOT affect User B)
 *    - Unauthenticated and forged session tokens
 * 2. Webhook Dispatcher Fault Tolerance & Resilience
 *    - Invalid protocol injections (ftp://, javascript:, file://, etc.)
 *    - Missing and malformed hostnames
 *    - Unreachable endpoints (ECONNREFUSED, ENOTFOUND) without crashing
 *    - Remote error codes (400, 401, 403, 404, 500, 502, 503)
 *    - 5000ms timeout enforcement via AbortController
 *    - Scanner survival under hostile/failing webhook target
 * 3. Scheduled Cron Route Security under Production Hardening
 *    - NODE_ENV=production with unauthenticated GET and POST -> 401
 *    - NODE_ENV=production with incorrect Bearer, header, or query tokens -> 401
 *    - NODE_ENV=production with unset CRON_SECRET -> 401
 *    - Valid authorization under Bearer, x-cron-secret, and query parameter -> 200
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma, checkDatabaseConnection } from '@/lib/db';
import { createSessionToken } from '@/lib/auth';
import { GET as getNotificationsHandler } from '@/app/api/notifications/route';
import { PATCH as markReadHandler, PUT as putMarkReadHandler } from '@/app/api/notifications/[id]/read/route';
import { POST as markAllReadHandler } from '@/app/api/notifications/mark-all-read/route';
import { GET as unreadCountHandler } from '@/app/api/notifications/unread-count/route';
import { POST as checkNotificationsHandler } from '@/app/api/notifications/check/route';
import { POST as testWebhookHandler } from '@/app/api/notifications/test-webhook/route';
import { GET as getCronHandler, POST as postCronHandler } from '@/app/api/cron/maturity-check/route';
import { scanMaturityAlertsForUser } from '@/lib/notifications';
import {
  validateWebhookUrl,
  sendWebhook,
  dispatchWebhookAlert,
  formatWebhookPayload,
  detectWebhookChannel,
} from '@/lib/webhook';

describe('Adversarial Challenge: Milestone 5 Notification Engine, Multi-Tenancy & Resilience', () => {
  const challengeRunId = Date.now();
  let userAId: string;
  let userBId: string;
  let userACookie: string;
  let userBCookie: string;

  let userANotif1Id: string;
  let userANotif2Id: string;
  let userANotif3Id: string;

  let userBNotif1Id: string;
  let userBNotif2Id: string;

  beforeAll(async () => {
    const health = await checkDatabaseConnection();
    expect(health.connected).toBe(true);

    // 1. Create Tenant A (Attacker perspective in IDOR tests)
    const userA = await prisma.user.create({
      data: {
        email: `adv_notif_alice_${challengeRunId}@assetpulse.dev`,
        password: 'PasswordAliceAdv1!',
        name: 'Alice Adv Challenger',
      },
    });
    userAId = userA.id;
    const tokenA = await createSessionToken({ id: userA.id, email: userA.email, name: userA.name });
    userACookie = `assetpulse_session=${tokenA}`;

    // 2. Create Tenant B (Victim perspective in IDOR tests)
    const userB = await prisma.user.create({
      data: {
        email: `adv_notif_bob_${challengeRunId}@assetpulse.dev`,
        password: 'PasswordBobAdv2!',
        name: 'Bob Adv Challenger',
      },
    });
    userBId = userB.id;
    const tokenB = await createSessionToken({ id: userB.id, email: userB.email, name: userB.name });
    userBCookie = `assetpulse_session=${tokenB}`;

    // 3. Seed Fixed Deposit for User A
    const now = new Date();
    const depA = await prisma.fixedDeposit.create({
      data: {
        userId: userAId,
        bankName: 'Alice Bank Corp',
        accountNumber: 'FD-ALICE-100',
        principalAmount: 50000,
        annualRate: 6.5,
        compoundingFrequency: 'QUARTERLY',
        startDate: new Date(now.getTime() - 100 * 86400000),
        maturityDate: new Date(now.getTime() + 7 * 86400000),
        maturityAmount: 51800,
        totalInterestEarned: 1800,
        status: 'ACTIVE',
      },
    });

    // 4. Seed Fixed Deposit for User B
    const depB = await prisma.fixedDeposit.create({
      data: {
        userId: userBId,
        bankName: 'Bob Bank Corp',
        accountNumber: 'FD-BOB-200',
        principalAmount: 80000,
        annualRate: 7.0,
        compoundingFrequency: 'MONTHLY',
        startDate: new Date(now.getTime() - 200 * 86400000),
        maturityDate: new Date(now.getTime() + 3 * 86400000),
        maturityAmount: 84800,
        totalInterestEarned: 4800,
        status: 'ACTIVE',
      },
    });

    // 5. Seed 3 Notifications for User A
    const notifA1 = await prisma.notification.create({
      data: {
        userId: userAId,
        depositId: depA.id,
        type: 'MATURING_7_DAYS',
        severity: 'warning',
        title: 'Alice Alert 7 Days',
        message: 'Deposit maturing in 7 days',
        isRead: false,
      },
    });
    userANotif1Id = notifA1.id;

    const notifA2 = await prisma.notification.create({
      data: {
        userId: userAId,
        depositId: depA.id,
        type: 'MATURING_14_DAYS',
        severity: 'warning',
        title: 'Alice Alert 14 Days',
        message: 'Deposit maturing in 14 days',
        isRead: false,
      },
    });
    userANotif2Id = notifA2.id;

    const notifA3 = await prisma.notification.create({
      data: {
        userId: userAId,
        depositId: depA.id,
        type: 'MATURING_30_DAYS',
        severity: 'info',
        title: 'Alice Alert 30 Days',
        message: 'Deposit maturing in 30 days',
        isRead: false,
      },
    });
    userANotif3Id = notifA3.id;

    // 6. Seed 2 Notifications for User B
    const notifB1 = await prisma.notification.create({
      data: {
        userId: userBId,
        depositId: depB.id,
        type: 'MATURED_TODAY',
        severity: 'critical',
        title: 'Bob Alert Matured Today',
        message: 'Bob deposit matured today',
        isRead: false,
      },
    });
    userBNotif1Id = notifB1.id;

    const notifB2 = await prisma.notification.create({
      data: {
        userId: userBId,
        depositId: depB.id,
        type: 'MATURING_7_DAYS',
        severity: 'warning',
        title: 'Bob Alert 7 Days',
        message: 'Bob deposit maturing in 7 days',
        isRead: false,
      },
    });
    userBNotif2Id = notifB2.id;
  });

  afterAll(async () => {
    // Cleanup challenge users
    if (userAId) {
      await prisma.notification.deleteMany({ where: { userId: userAId } });
      await prisma.fixedDeposit.deleteMany({ where: { userId: userAId } });
      await prisma.user.delete({ where: { id: userAId } }).catch(() => {});
    }
    if (userBId) {
      await prisma.notification.deleteMany({ where: { userId: userBId } });
      await prisma.fixedDeposit.deleteMany({ where: { userId: userBId } });
      await prisma.user.delete({ where: { id: userBId } }).catch(() => {});
    }
  });

  // ============================================================================
  // Suite 1: Multi-Tenant Isolation & IDOR Protection
  // ============================================================================
  describe('Suite 1: Multi-Tenant Isolation & IDOR Protection', () => {
    it('CHALLENGE-1.1: User A cannot read User B notifications across any query parameter variation', async () => {
      // Query 1: Default list
      const req1 = new NextRequest('http://localhost:3000/api/notifications', {
        headers: { Cookie: userACookie },
      });
      const res1 = await getNotificationsHandler(req1);
      expect(res1.status).toBe(200);
      const data1 = await res1.json();

      expect(data1.notifications.length).toBe(3);
      expect(data1.unreadCount).toBe(3);
      expect(data1.total).toBe(3);
      // Ensure zero User B notifications leaked
      expect(data1.notifications.some((n: any) => n.userId === userBId)).toBe(false);
      expect(data1.notifications.every((n: any) => n.userId === userAId)).toBe(true);

      // Query 2: Deep pagination attack (limit=100, page=1)
      const req2 = new NextRequest('http://localhost:3000/api/notifications?limit=100&page=1', {
        headers: { Cookie: userACookie },
      });
      const res2 = await getNotificationsHandler(req2);
      const data2 = await res2.json();
      expect(data2.notifications.length).toBe(3);
      expect(data2.notifications.some((n: any) => n.id === userBNotif1Id || n.id === userBNotif2Id)).toBe(false);

      // Query 3: Type filter for MATURED_TODAY (which only User B possesses)
      const req3 = new NextRequest('http://localhost:3000/api/notifications?type=MATURED_TODAY', {
        headers: { Cookie: userACookie },
      });
      const res3 = await getNotificationsHandler(req3);
      const data3 = await res3.json();
      // User A has 0 MATURED_TODAY, should return empty list without leaking User B's record
      expect(data3.notifications.length).toBe(0);
      expect(data3.total).toBe(0);
    });

    it('CHALLENGE-1.2: User A cannot mark User B notification as read via PATCH (uniform 404 error)', async () => {
      const req = new NextRequest(`http://localhost:3000/api/notifications/${userBNotif1Id}/read`, {
        method: 'PATCH',
        headers: { Cookie: userACookie },
      });

      const res = await markReadHandler(req, { params: { id: userBNotif1Id } });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('Notification not found');

      // Verify User B's notification in DB remains untouched
      const dbNotifB = await prisma.notification.findUnique({
        where: { id: userBNotif1Id },
      });
      expect(dbNotifB).not.toBeNull();
      expect(dbNotifB!.isRead).toBe(false);
      expect(dbNotifB!.readAt).toBeNull();
    });

    it('CHALLENGE-1.3: User A cannot mark User B notification as read via PUT alias (uniform 404 error)', async () => {
      const req = new NextRequest(`http://localhost:3000/api/notifications/${userBNotif2Id}/read`, {
        method: 'PUT',
        headers: { Cookie: userACookie },
      });

      const res = await putMarkReadHandler(req, { params: { id: userBNotif2Id } });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('Notification not found');

      // Verify User B's notification in DB remains untouched
      const dbNotifB = await prisma.notification.findUnique({
        where: { id: userBNotif2Id },
      });
      expect(dbNotifB!.isRead).toBe(false);
      expect(dbNotifB!.readAt).toBeNull();
    });

    it('CHALLENGE-1.4: Non-existent notification ID returns identical uniform 404 to prevent ID enumeration', async () => {
      const fakeId = '00000000-0000-4000-a000-000000000000';
      const req = new NextRequest(`http://localhost:3000/api/notifications/${fakeId}/read`, {
        method: 'PATCH',
        headers: { Cookie: userACookie },
      });

      const res = await markReadHandler(req, { params: { id: fakeId } });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('Notification not found');
    });

    it('CHALLENGE-1.5: POST /api/notifications/mark-all-read affects ONLY the authenticated tenant', async () => {
      // Prior state: User A has 3 unread, User B has 2 unread
      const countBBefore = await unreadCountHandler(
        new NextRequest('http://localhost:3000/api/notifications/unread-count', {
          headers: { Cookie: userBCookie },
        })
      );
      const dataBBefore = await countBBefore.json();
      expect(dataBBefore.unreadCount).toBe(2);

      // User A executes mark-all-read
      const reqA = new NextRequest('http://localhost:3000/api/notifications/mark-all-read', {
        method: 'POST',
        headers: { Cookie: userACookie },
      });
      const resA = await markAllReadHandler(reqA);
      expect(resA.status).toBe(200);
      const dataA = await resA.json();
      expect(dataA.success).toBe(true);
      expect(dataA.count).toBe(3);

      // Verify User A unread count is now 0
      const countAAfter = await unreadCountHandler(
        new NextRequest('http://localhost:3000/api/notifications/unread-count', {
          headers: { Cookie: userACookie },
        })
      );
      const dataAAfter = await countAAfter.json();
      expect(dataAAfter.unreadCount).toBe(0);

      // CRITICAL CHECK: User B unread count MUST STILL BE 2
      const countBAfter = await unreadCountHandler(
        new NextRequest('http://localhost:3000/api/notifications/unread-count', {
          headers: { Cookie: userBCookie },
        })
      );
      const dataBAfter = await countBAfter.json();
      expect(dataBAfter.unreadCount).toBe(2);

      // Direct DB verification: User B's notifications are STILL unread
      const bRecords = await prisma.notification.findMany({
        where: { userId: userBId },
      });
      expect(bRecords.length).toBe(2);
      expect(bRecords.every((n) => n.isRead === false)).toBe(true);

      // Now User B executes mark-all-read
      const reqB = new NextRequest('http://localhost:3000/api/notifications/mark-all-read', {
        method: 'POST',
        headers: { Cookie: userBCookie },
      });
      const resB = await markAllReadHandler(reqB);
      expect(resB.status).toBe(200);
      const dataB = await resB.json();
      expect(dataB.success).toBe(true);
      expect(dataB.count).toBe(2);

      // User B unread count is now 0
      const countBFinal = await unreadCountHandler(
        new NextRequest('http://localhost:3000/api/notifications/unread-count', {
          headers: { Cookie: userBCookie },
        })
      );
      const dataBFinal = await countBFinal.json();
      expect(dataBFinal.unreadCount).toBe(0);
    });

    it('CHALLENGE-1.6: Forged or malformed session cookies are rejected across all notification endpoints', async () => {
      const forgedCookie = 'assetpulse_session=invalid.forged.jwt.token';
      const endpoints = [
        { path: 'http://localhost:3000/api/notifications', handler: getNotificationsHandler, method: 'GET' },
        { path: 'http://localhost:3000/api/notifications/unread-count', handler: unreadCountHandler, method: 'GET' },
        { path: 'http://localhost:3000/api/notifications/mark-all-read', handler: markAllReadHandler, method: 'POST' },
        { path: 'http://localhost:3000/api/notifications/check', handler: checkNotificationsHandler, method: 'POST' },
      ];

      for (const ep of endpoints) {
        const req = new NextRequest(ep.path, {
          method: ep.method,
          headers: { Cookie: forgedCookie },
        });
        const res = await ep.handler(req as any);
        expect(res.status).toBe(401);
      }
    });
  });

  // ============================================================================
  // Suite 2: Webhook Dispatcher Fault Tolerance & Error Handling
  // ============================================================================
  describe('Suite 2: Webhook Dispatcher Fault Tolerance & Resilience', () => {
    it('CHALLENGE-2.1: Reject invalid and dangerous webhook URLs in validation and test-webhook API', async () => {
      const invalidUrls = [
        '',
        '   ',
        'ftp://fileserver.example.com/webhook',
        'javascript:alert(document.cookie)',
        'file:///etc/passwd',
        'gopher://gopher.floodgap.com',
        'data:text/plain;base64,SGVsbG8sIFdvcmxkIQ==',
        'http://',
        'https://',
        'http://   ',
        'not-a-url',
        '://missing-scheme',
      ];

      for (const url of invalidUrls) {
        // 1. Check pure validator
        const val = validateWebhookUrl(url);
        expect(val.valid).toBe(false);
        expect(val.error).toBeDefined();

        // 2. Check test-webhook endpoint handler
        const req = new NextRequest('http://localhost:3000/api/notifications/test-webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: userACookie },
          body: JSON.stringify({ webhookUrl: url }),
        });
        const res = await testWebhookHandler(req);
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toBeDefined();
      }
    });

    it('CHALLENGE-2.2: Unreachable host or network failure produces handled error without crashing process', async () => {
      // Simulate unreachable target via fetch mock rejection
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      fetchSpy.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND unreachable-domain-999.invalid'));

      const req = new NextRequest('http://localhost:3000/api/notifications/test-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          webhookUrl: 'https://unreachable-domain-999.invalid/webhook',
        }),
      });

      const res = await testWebhookHandler(req);
      // Must return handled 400 or 502, NOT 500 unhandled
      expect([400, 502]).toContain(res.status);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('ENOTFOUND');
      expect(typeof data.durationMs).toBe('number');

      fetchSpy.mockRestore();
    });

    it('CHALLENGE-2.3: Remote server 5xx and 4xx status codes are handled gracefully', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      // Test HTTP 503 Service Unavailable
      fetchSpy.mockResolvedValueOnce(
        new Response('Service Unavailable', { status: 503, statusText: 'Service Unavailable' })
      );

      const req503 = new NextRequest('http://localhost:3000/api/notifications/test-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({ webhookUrl: 'https://failing-remote.service/webhook' }),
      });

      const res503 = await testWebhookHandler(req503);
      expect(res503.status).toBe(502);
      const data503 = await res503.json();
      expect(data503.success).toBe(false);
      expect(data503.statusCode).toBe(503);
      expect(data503.error).toContain('HTTP 503');

      // Test HTTP 404 Not Found
      fetchSpy.mockResolvedValueOnce(
        new Response('Not Found', { status: 404, statusText: 'Not Found' })
      );

      const req404 = new NextRequest('http://localhost:3000/api/notifications/test-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({ webhookUrl: 'https://missing-remote.service/webhook' }),
      });

      const res404 = await testWebhookHandler(req404);
      expect(res404.status).toBe(400);
      const data404 = await res404.json();
      expect(data404.success).toBe(false);
      expect(data404.statusCode).toBe(404);
      expect(data404.error).toContain('HTTP 404');

      fetchSpy.mockRestore();
    });

    it('CHALLENGE-2.4: 5000ms timeout enforcement via AbortController is observed', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      // Simulate timeout AbortError
      const abortError: any = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      fetchSpy.mockRejectedValueOnce(abortError);

      const result = await sendWebhook('https://hanging-server.invalid/webhook', { test: true }, { timeoutMs: 5000 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out after 5000ms');
      expect(typeof result.durationMs).toBe('number');

      fetchSpy.mockRestore();
    });

    it('CHALLENGE-2.5: dispatchWebhookAlert fails safely and returns false on dispatch error without throwing', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      fetchSpy.mockRejectedValueOnce(new Error('Fatal socket hangup'));

      const result = await dispatchWebhookAlert(
        {
          event: 'MATURED_TODAY',
          deposit: {
            bankName: 'Test Bank',
            accountNumber: 'TEST-123',
            principal: 10000,
          },
        },
        'https://crash-test.invalid/webhook'
      );

      // Must safely evaluate to false, zero uncaught exception
      expect(result).toBe(false);
      fetchSpy.mockRestore();
    });

    it('CHALLENGE-2.6: Maturity proximity scanner survives failing webhook without interrupting alert creation', async () => {
      // Create user with maturing deposit
      const userHostile = await prisma.user.create({
        data: {
          email: `hostile_webhook_${challengeRunId}@assetpulse.dev`,
          password: 'PasswordHostile123!',
          name: 'Hostile Webhook User',
        },
      });

      const now = new Date();
      await prisma.fixedDeposit.create({
        data: {
          userId: userHostile.id,
          bankName: 'Hostile Target Bank',
          accountNumber: 'FD-HOSTILE-001',
          principalAmount: 25000,
          annualRate: 8.0,
          compoundingFrequency: 'ANNUALLY',
          startDate: new Date(now.getTime() - 365 * 86400000),
          maturityDate: new Date(now.getTime()), // matures today
          maturityAmount: 27000,
          totalInterestEarned: 2000,
          status: 'ACTIVE',
        },
      });

      // Point WEBHOOK_URL to a crashing endpoint
      const originalWebhookUrl = process.env.WEBHOOK_URL;
      process.env.WEBHOOK_URL = 'https://hostile-failing-endpoint.invalid/webhook';

      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      fetchSpy.mockRejectedValue(new Error('Fatal connection reset by peer'));

      try {
        // Run scanner: MUST NOT CRASH
        const scanResult = await scanMaturityAlertsForUser(userHostile.id, { dispatchWebhooks: true });

        expect(scanResult.userId).toBe(userHostile.id);
        expect(scanResult.notificationsCreated).toBe(1);
        expect(scanResult.webhooksDispatched).toBe(0);

        // Verify in DB that notification was created despite webhook crash
        const notifs = await prisma.notification.findMany({
          where: { userId: userHostile.id },
        });
        expect(notifs.length).toBe(1);
        expect(notifs[0].type).toBe('MATURED_TODAY');
        expect(notifs[0].severity).toBe('critical');

        // Verify deposit status transitioned to MATURED
        const updatedDep = await prisma.fixedDeposit.findFirst({
          where: { userId: userHostile.id },
        });
        expect(updatedDep!.status).toBe('MATURED');
      } finally {
        fetchSpy.mockRestore();
        process.env.WEBHOOK_URL = originalWebhookUrl;
        await prisma.notification.deleteMany({ where: { userId: userHostile.id } });
        await prisma.fixedDeposit.deleteMany({ where: { userId: userHostile.id } });
        await prisma.user.delete({ where: { id: userHostile.id } }).catch(() => {});
      }
    });
  });

  // ============================================================================
  // Suite 3: Cron Route Security under Production Hardening
  // ============================================================================
  describe('Suite 3: Cron Route Security under Production Mode', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalSecret = process.env.CRON_SECRET;
    const prodSecret = 'AP_CRON_SECURE_TOKEN_PROD_2026';

    beforeAll(() => {
      process.env.NODE_ENV = 'production';
      process.env.CRON_SECRET = prodSecret;
    });

    afterAll(() => {
      process.env.NODE_ENV = originalEnv;
      process.env.CRON_SECRET = originalSecret;
    });

    it('CHALLENGE-3.1: Reject unauthenticated GET and POST requests with 401 when NODE_ENV=production', async () => {
      // Unauthenticated GET
      const getReq = new NextRequest('http://localhost:3000/api/cron/maturity-check', {
        method: 'GET',
      });
      const getRes = await getCronHandler(getReq);
      expect(getRes.status).toBe(401);
      const getData = await getRes.json();
      expect(getData.error).toBe('Unauthorized');

      // Unauthenticated POST
      const postReq = new NextRequest('http://localhost:3000/api/cron/maturity-check', {
        method: 'POST',
      });
      const postRes = await postCronHandler(postReq);
      expect(postRes.status).toBe(401);
      const postData = await postRes.json();
      expect(postData.error).toBe('Unauthorized');
    });

    it('CHALLENGE-3.2: Reject incorrect Bearer token with 401 in production', async () => {
      const req = new NextRequest('http://localhost:3000/api/cron/maturity-check', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer wrong-production-cron-token',
        },
      });

      const res = await postCronHandler(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Unauthorized');
    });

    it('CHALLENGE-3.3: Reject incorrect x-cron-secret header with 401 in production', async () => {
      const req = new NextRequest('http://localhost:3000/api/cron/maturity-check', {
        method: 'GET',
        headers: {
          'x-cron-secret': 'attacker-forged-secret',
        },
      });

      const res = await getCronHandler(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Unauthorized');
    });

    it('CHALLENGE-3.4: Reject incorrect query parameters (?token=... or ?secret=...) with 401 in production', async () => {
      const req1 = new NextRequest('http://localhost:3000/api/cron/maturity-check?token=bad-token', {
        method: 'GET',
      });
      expect((await getCronHandler(req1)).status).toBe(401);

      const req2 = new NextRequest('http://localhost:3000/api/cron/maturity-check?secret=bad-secret', {
        method: 'POST',
      });
      expect((await postCronHandler(req2)).status).toBe(401);
    });

    it('CHALLENGE-3.5: Accept valid credentials via Bearer, header, or query param in production', async () => {
      // 1. Bearer token
      const reqBearer = new NextRequest('http://localhost:3000/api/cron/maturity-check', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${prodSecret}`,
        },
      });
      const resBearer = await postCronHandler(reqBearer);
      expect(resBearer.status).toBe(200);
      const dataBearer = await resBearer.json();
      expect(dataBearer.success).toBe(true);

      // 2. x-cron-secret header
      const reqHeader = new NextRequest('http://localhost:3000/api/cron/maturity-check', {
        method: 'GET',
        headers: {
          'x-cron-secret': prodSecret,
        },
      });
      const resHeader = await getCronHandler(reqHeader);
      expect(resHeader.status).toBe(200);
      const dataHeader = await resHeader.json();
      expect(dataHeader.success).toBe(true);

      // 3. Query param token
      const reqQuery = new NextRequest(`http://localhost:3000/api/cron/maturity-check?token=${prodSecret}`, {
        method: 'GET',
      });
      const resQuery = await getCronHandler(reqQuery);
      expect(resQuery.status).toBe(200);
      const dataQuery = await resQuery.json();
      expect(dataQuery.success).toBe(true);
    });

    it('CHALLENGE-3.6: Reject unauthenticated request when CRON_SECRET is empty string in production', async () => {
      process.env.CRON_SECRET = '';
      const req = new NextRequest('http://localhost:3000/api/cron/maturity-check', {
        method: 'GET',
      });

      const res = await getCronHandler(req);
      expect(res.status).toBe(401);
      process.env.CRON_SECRET = prodSecret; // Restore for other tests
    });
  });
});

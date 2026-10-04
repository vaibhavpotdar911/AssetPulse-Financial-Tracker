/**
 * AssetPulse - Milestone 5 Integration Test Suite
 * File: tests/integration/notification-routes.test.ts
 * 
 * Verifies:
 * 1. Proximity scanning and alert generation across 30d, 14d, 7d, 0d thresholds.
 * 2. Alert deduplication (scanning twice does NOT produce duplicate notifications).
 * 3. GET /api/notifications, unread count, PATCH /api/notifications/[id]/read, and POST /api/notifications/mark-all-read.
 * 4. Multi-tenant isolation (User B cannot view or mark User A's notifications).
 * 5. Webhook dispatch logic and test-webhook endpoint.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma, checkDatabaseConnection } from '@/lib/db';
import { createSessionToken } from '@/lib/auth';
import { GET as getNotificationsHandler } from '@/app/api/notifications/route';
import { POST as checkNotificationsHandler } from '@/app/api/notifications/check/route';
import { PATCH as markReadHandler, PUT as putMarkReadHandler } from '@/app/api/notifications/[id]/read/route';
import { POST as markAllReadHandler } from '@/app/api/notifications/mark-all-read/route';
import { GET as unreadCountHandler } from '@/app/api/notifications/unread-count/route';
import { POST as testWebhookHandler } from '@/app/api/notifications/test-webhook/route';
import { GET as getCronHandler, POST as postCronHandler } from '@/app/api/cron/maturity-check/route';
import { scanMaturityAlertsForUser } from '@/lib/notifications';
import {
  formatWebhookPayload,
  sendWebhook,
  dispatchWebhookAlert,
  validateWebhookUrl,
} from '@/lib/webhook';

describe('Integration Test: Milestone 5 Notification Engine & Webhook Dispatcher', () => {
  const runTimestamp = Date.now();
  let userAId: string;
  let userBId: string;
  let userACookie: string;
  let userBCookie: string;

  let depMaturedTodayId: string;
  let dep7DaysId: string;
  let dep14DaysId: string;
  let dep30DaysId: string;
  let depFarFutureId: string;

  beforeAll(async () => {
    const health = await checkDatabaseConnection();
    expect(health.connected).toBe(true);

    // 1. Create User A (Primary Tenant)
    const userA = await prisma.user.create({
      data: {
        email: `notif_alice_${runTimestamp}@assetpulse.dev`,
        password: 'PasswordAlice123!',
        name: 'Alice Notifications',
      },
    });
    userAId = userA.id;
    const tokenA = await createSessionToken({ id: userA.id, email: userA.email, name: userA.name });
    userACookie = `assetpulse_session=${tokenA}`;

    // 2. Create User B (Isolated Tenant)
    const userB = await prisma.user.create({
      data: {
        email: `notif_bob_${runTimestamp}@assetpulse.dev`,
        password: 'PasswordBob456!',
        name: 'Bob Notifications',
      },
    });
    userBId = userB.id;
    const tokenB = await createSessionToken({ id: userB.id, email: userB.email, name: userB.name });
    userBCookie = `assetpulse_session=${tokenB}`;

    // 3. Seed Fixed Deposits for User A across all horizon windows
    const now = new Date();
    const msPerDay = 86400000;

    // Horizon 0d: Matured Today (0 days remaining)
    const depToday = await prisma.fixedDeposit.create({
      data: {
        userId: userAId,
        bankName: 'JPMorgan Chase',
        accountNumber: 'FD-TODAY-001',
        principalAmount: 100000,
        annualRate: 7.0,
        compoundingFrequency: 'QUARTERLY',
        startDate: new Date(now.getTime() - 365 * msPerDay),
        maturityDate: new Date(now.getTime()), // today
        maturityAmount: 107185.90,
        totalInterestEarned: 7185.90,
        status: 'ACTIVE',
      },
    });
    depMaturedTodayId = depToday.id;

    // Horizon 7d: Maturing in 5 days (1 <= t <= 7)
    const dep7 = await prisma.fixedDeposit.create({
      data: {
        userId: userAId,
        bankName: 'Citibank N.A.',
        accountNumber: 'FD-7DAY-002',
        principalAmount: 50000,
        annualRate: 6.5,
        compoundingFrequency: 'MONTHLY',
        startDate: new Date(now.getTime() - 360 * msPerDay),
        maturityDate: new Date(now.getTime() + 5 * msPerDay),
        maturityAmount: 53348.50,
        totalInterestEarned: 3348.50,
        status: 'ACTIVE',
      },
    });
    dep7DaysId = dep7.id;

    // Horizon 14d: Maturing in 12 days (8 <= t <= 14)
    const dep14 = await prisma.fixedDeposit.create({
      data: {
        userId: userAId,
        bankName: 'Wells Fargo',
        accountNumber: 'FD-14DAY-003',
        principalAmount: 75000,
        annualRate: 6.0,
        compoundingFrequency: 'ANNUALLY',
        startDate: new Date(now.getTime() - 353 * msPerDay),
        maturityDate: new Date(now.getTime() + 12 * msPerDay),
        maturityAmount: 79500.00,
        totalInterestEarned: 4500.00,
        status: 'ACTIVE',
      },
    });
    dep14DaysId = dep14.id;

    // Horizon 30d: Maturing in 25 days (15 <= t <= 30)
    const dep30 = await prisma.fixedDeposit.create({
      data: {
        userId: userAId,
        bankName: 'Bank of America',
        accountNumber: 'FD-30DAY-004',
        principalAmount: 200000,
        annualRate: 7.2,
        compoundingFrequency: 'QUARTERLY',
        startDate: new Date(now.getTime() - 340 * msPerDay),
        maturityDate: new Date(now.getTime() + 25 * msPerDay),
        maturityAmount: 214792.00,
        totalInterestEarned: 14792.00,
        status: 'ACTIVE',
      },
    });
    dep30DaysId = dep30.id;

    // Far Future: Maturing in 90 days (t > 30, should NOT trigger any notification)
    const depFar = await prisma.fixedDeposit.create({
      data: {
        userId: userAId,
        bankName: 'Barclays Bank',
        accountNumber: 'FD-FAR-005',
        principalAmount: 30000,
        annualRate: 5.5,
        compoundingFrequency: 'ANNUALLY',
        startDate: new Date(now.getTime() - 275 * msPerDay),
        maturityDate: new Date(now.getTime() + 90 * msPerDay),
        maturityAmount: 31650.00,
        totalInterestEarned: 1650.00,
        status: 'ACTIVE',
      },
    });
    depFarFutureId = depFar.id;
  });

  afterAll(async () => {
    // Teardown notifications, deposits, and users
    await prisma.notification.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.fixedDeposit.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  });

  // ==========================================================================
  // Section 1: Maturity Scanner & Proximity Horizons (0d, 7d, 14d, 30d)
  // ==========================================================================
  describe('1. Maturity Scanner & Proximity Horizon Alert Generation', () => {
    it('should scan active deposits and generate notifications across 0d, 7d, 14d, 30d thresholds', async () => {
      const req = new NextRequest('http://localhost:3000/api/notifications/check', {
        method: 'POST',
        headers: { Cookie: userACookie },
      });

      const res = await checkNotificationsHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.userId).toBe(userAId);
      expect(data.notificationsCreated).toBe(4);
      expect(data.scanned).toBe(5);

      // Verify records in database
      const notifs = await prisma.notification.findMany({
        where: { userId: userAId },
        orderBy: { createdAt: 'desc' },
      });
      expect(notifs.length).toBe(4);

      // 1. Matured Today
      const todayNotif = notifs.find((n) => n.depositId === depMaturedTodayId);
      expect(todayNotif).toBeDefined();
      expect(todayNotif?.type).toBe('MATURED_TODAY');
      expect(todayNotif?.severity).toBe('critical');
      expect(todayNotif?.isRead).toBe(false);
      expect(todayNotif?.title).toMatch(/Matured Today/i);
      expect(todayNotif?.message).toContain('JPMorgan Chase');

      // Verify status transition: Active deposit at t <= 0 transitioned to MATURED
      const updatedDepToday = await prisma.fixedDeposit.findUnique({
        where: { id: depMaturedTodayId },
      });
      expect(updatedDepToday?.status).toBe('MATURED');

      // 2. 7-Day Window
      const notif7 = notifs.find((n) => n.depositId === dep7DaysId);
      expect(notif7).toBeDefined();
      expect(notif7?.type).toBe('MATURING_7_DAYS');
      expect(notif7?.severity).toBe('warning');
      expect(notif7?.message).toContain('Citibank N.A.');

      // 3. 14-Day Window
      const notif14 = notifs.find((n) => n.depositId === dep14DaysId);
      expect(notif14).toBeDefined();
      expect(notif14?.type).toBe('MATURING_14_DAYS');
      expect(notif14?.severity).toBe('warning');
      expect(notif14?.message).toContain('Wells Fargo');

      // 4. 30-Day Window
      const notif30 = notifs.find((n) => n.depositId === dep30DaysId);
      expect(notif30).toBeDefined();
      expect(notif30?.type).toBe('MATURING_30_DAYS');
      expect(notif30?.severity).toBe('info');
      expect(notif30?.message).toContain('Bank of America');

      // 5. Far Future (>30d) must have zero alerts
      const notifFar = notifs.find((n) => n.depositId === depFarFutureId);
      expect(notifFar).toBeUndefined();
    });
  });

  // ==========================================================================
  // Section 2: Alert Deduplication Logic
  // ==========================================================================
  describe('2. Strict Alert Deduplication Verification', () => {
    it('should NOT generate duplicate notifications when scan is executed repeatedly', async () => {
      // Execute immediate second scan via POST /api/notifications/check
      const req2 = new NextRequest('http://localhost:3000/api/notifications/check', {
        method: 'POST',
        headers: { Cookie: userACookie },
      });

      const res2 = await checkNotificationsHandler(req2);
      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2.success).toBe(true);
      expect(data2.notificationsCreated).toBe(0);

      // Execute third direct scan via library function
      const libScan = await scanMaturityAlertsForUser(userAId);
      expect(libScan.notificationsCreated).toBe(0);

      // Verify total notification count in database has not changed
      const totalInDb = await prisma.notification.count({
        where: { userId: userAId },
      });
      expect(totalInDb).toBe(4);
    });
  });

  // ==========================================================================
  // Section 3: Notification Retrieval, Filtering & Unread Counts
  // ==========================================================================
  describe('3. Notification Query API & Unread Counter Handlers', () => {
    it('should retrieve list of notifications ordered by createdAt desc with unreadCount (GET /api/notifications)', async () => {
      const req = new NextRequest('http://localhost:3000/api/notifications', {
        method: 'GET',
        headers: { Cookie: userACookie },
      });

      const res = await getNotificationsHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(Array.isArray(data.notifications)).toBe(true);
      expect(data.notifications.length).toBe(4);
      expect(data.unreadCount).toBe(4);
      expect(data.total).toBe(4);

      // Verify deposit relation inclusion
      const first = data.notifications[0];
      expect(first.deposit).toBeDefined();
      expect(first.deposit.bankName).toBeDefined();
      expect(first.deposit.principalAmount).toBeDefined();
    });

    it('should filter notifications by unreadOnly=true', async () => {
      const req = new NextRequest('http://localhost:3000/api/notifications?unreadOnly=true', {
        method: 'GET',
        headers: { Cookie: userACookie },
      });

      const res = await getNotificationsHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.notifications.length).toBe(4);
      expect(data.notifications.every((n: any) => n.isRead === false)).toBe(true);
    });

    it('should filter notifications by type=MATURED_TODAY', async () => {
      const req = new NextRequest('http://localhost:3000/api/notifications?type=MATURED_TODAY', {
        method: 'GET',
        headers: { Cookie: userACookie },
      });

      const res = await getNotificationsHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.notifications.length).toBe(1);
      expect(data.notifications[0].type).toBe('MATURED_TODAY');
    });

    it('should return lightweight unread count via GET /api/notifications/unread-count', async () => {
      const req = new NextRequest('http://localhost:3000/api/notifications/unread-count', {
        method: 'GET',
        headers: { Cookie: userACookie },
      });

      const res = await unreadCountHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.unreadCount).toBe(4);
    });
  });

  // ==========================================================================
  // Section 4: Read State Mutations (Single Mark Read & Mark All Read)
  // ==========================================================================
  describe('4. Read State Mutation APIs (PATCH [id]/read & POST mark-all-read)', () => {
    let targetNotifId: string;

    it('should mark a single notification as read via PATCH /api/notifications/[id]/read', async () => {
      const notif = await prisma.notification.findFirst({
        where: { userId: userAId, type: 'MATURED_TODAY' },
      });
      expect(notif).not.toBeNull();
      targetNotifId = notif!.id;

      const req = new NextRequest(`http://localhost:3000/api/notifications/${targetNotifId}/read`, {
        method: 'PATCH',
        headers: { Cookie: userACookie },
      });

      const res = await markReadHandler(req, { params: { id: targetNotifId } });
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.notification.id).toBe(targetNotifId);
      expect(data.notification.isRead).toBe(true);
      expect(data.notification.readAt).toBeDefined();

      // Verify unread count decremented
      const countRes = await unreadCountHandler(
        new NextRequest('http://localhost:3000/api/notifications/unread-count', {
          headers: { Cookie: userACookie },
        })
      );
      const countData = await countRes.json();
      expect(countData.unreadCount).toBe(3);
    });

    it('should support PUT alias for /api/notifications/[id]/read', async () => {
      const req = new NextRequest(`http://localhost:3000/api/notifications/${targetNotifId}/read`, {
        method: 'PUT',
        headers: { Cookie: userACookie },
      });

      const res = await putMarkReadHandler(req, { params: { id: targetNotifId } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.notification.isRead).toBe(true);
    });

    it('should mark all remaining unread notifications as read via POST /api/notifications/mark-all-read', async () => {
      const req = new NextRequest('http://localhost:3000/api/notifications/mark-all-read', {
        method: 'POST',
        headers: { Cookie: userACookie },
      });

      const res = await markAllReadHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.count).toBe(3);

      // Verify unread count is now 0
      const countRes = await unreadCountHandler(
        new NextRequest('http://localhost:3000/api/notifications/unread-count', {
          headers: { Cookie: userACookie },
        })
      );
      const countData = await countRes.json();
      expect(countData.unreadCount).toBe(0);

      // Verify unreadOnly returns empty list
      const listReq = new NextRequest('http://localhost:3000/api/notifications?unreadOnly=true', {
        headers: { Cookie: userACookie },
      });
      const listRes = await getNotificationsHandler(listReq);
      const listData = await listRes.json();
      expect(listData.notifications.length).toBe(0);
    });
  });

  // ==========================================================================
  // Section 5: Multi-Tenant Data Isolation
  // ==========================================================================
  describe('5. Strict Multi-Tenant Isolation & Authorization Guards', () => {
    it('should ensure User B sees 0 notifications belonging to User A', async () => {
      const req = new NextRequest('http://localhost:3000/api/notifications', {
        method: 'GET',
        headers: { Cookie: userBCookie },
      });

      const res = await getNotificationsHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.notifications.length).toBe(0);
      expect(data.unreadCount).toBe(0);
      expect(data.total).toBe(0);
    });

    it('should return 404 when User B attempts to mark User A notification as read', async () => {
      const notifA = await prisma.notification.findFirst({
        where: { userId: userAId },
      });
      expect(notifA).not.toBeNull();

      const req = new NextRequest(`http://localhost:3000/api/notifications/${notifA!.id}/read`, {
        method: 'PATCH',
        headers: { Cookie: userBCookie },
      });

      const res = await markReadHandler(req, { params: { id: notifA!.id } });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toMatch(/not found/i);
    });

    it('should return count 0 when User B executes mark-all-read without affecting User A records', async () => {
      const req = new NextRequest('http://localhost:3000/api/notifications/mark-all-read', {
        method: 'POST',
        headers: { Cookie: userBCookie },
      });

      const res = await markAllReadHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.count).toBe(0);
    });

    it('should reject unauthenticated requests to all notification endpoints with 401', async () => {
      const unauthGet = new NextRequest('http://localhost:3000/api/notifications');
      expect((await getNotificationsHandler(unauthGet)).status).toBe(401);

      const unauthCount = new NextRequest('http://localhost:3000/api/notifications/unread-count');
      expect((await unreadCountHandler(unauthCount)).status).toBe(401);

      const unauthMark = new NextRequest('http://localhost:3000/api/notifications/dummy-id/read', {
        method: 'PATCH',
      });
      expect((await markReadHandler(unauthMark, { params: { id: 'dummy-id' } })).status).toBe(401);

      const unauthMarkAll = new NextRequest('http://localhost:3000/api/notifications/mark-all-read', {
        method: 'POST',
      });
      expect((await markAllReadHandler(unauthMarkAll)).status).toBe(401);

      const unauthCheck = new NextRequest('http://localhost:3000/api/notifications/check', {
        method: 'POST',
      });
      expect((await checkNotificationsHandler(unauthCheck)).status).toBe(401);

      const unauthTestWebhook = new NextRequest('http://localhost:3000/api/notifications/test-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl: 'https://example.com/webhook' }),
      });
      expect((await testWebhookHandler(unauthTestWebhook)).status).toBe(401);
    });
  });

  // ==========================================================================
  // Section 6: Webhook Dispatcher & Test Webhook API Route
  // ==========================================================================
  describe('6. Webhook Dispatcher Subsystem & POST /api/notifications/test-webhook', () => {
    const mockDeposit = {
      id: 'dep-test-99',
      bankName: 'HSBC Holdings',
      accountNumber: 'HSBC-FD-9988',
      principal: 150000,
      principalAmount: 150000,
      maturityAmount: 161250,
      maturityDate: '2026-10-15',
      daysRemaining: 11,
      annualRate: 7.5,
      compoundingFrequency: 'QUARTERLY',
      status: 'ACTIVE',
    };

    it('should format structured payload for generic JSON channel with all required fields', () => {
      const payload = formatWebhookPayload('generic', {
        event: 'MATURITY_ALERT',
        deposit: mockDeposit,
        user: { id: userAId, email: 'alice@assetpulse.dev', name: 'Alice' },
      });

      expect(payload.event).toBe('MATURITY_ALERT');
      expect(payload.eventType).toBe('MATURITY_ALERT');
      expect(payload.timestamp).toBeDefined();
      expect(payload.message).toContain('HSBC Holdings');
      expect(payload.bankName).toBe('HSBC Holdings');
      expect(payload.principal).toBe(150000);
      expect(payload.maturityDate).toBe('2026-10-15');
      expect(payload.deposit).toBeDefined();
      expect(payload.deposit.maturityAmount).toBe(161250);
      expect(payload.deposit.daysRemaining).toBe(11);
      expect(payload.user).toBeDefined();
      expect(payload.user.email).toBe('alice@assetpulse.dev');
    });

    it('should format structured payload for Slack channel (Block Kit)', () => {
      const payload = formatWebhookPayload('slack', {
        event: 'MATURING_14_DAYS',
        deposit: mockDeposit,
      });

      expect(payload.text).toContain('HSBC Holdings');
      expect(Array.isArray(payload.blocks)).toBe(true);
      expect(payload.blocks.length).toBeGreaterThan(0);
      expect(payload.blocks[0].type).toBe('section');
      expect(payload.blocks[0].text.text).toContain('HSBC Holdings');
      expect(payload.blocks[0].text.text).toContain('$150,000.00');
    });

    it('should format structured payload for Discord channel (Embeds)', () => {
      const payload = formatWebhookPayload('discord', {
        event: 'MATURED_TODAY',
        deposit: mockDeposit,
      });

      expect(payload.content).toContain('🚨');
      expect(Array.isArray(payload.embeds)).toBe(true);
      expect(payload.embeds[0].title).toContain('HSBC Holdings');
      expect(payload.embeds[0].color).toBe(0xe11d48); // Rose critical color for matured today
      expect(payload.embeds[0].fields.some((f: any) => f.name === 'Bank' && f.value === 'HSBC Holdings')).toBe(true);
    });

    it('should format structured payload for Telegram channel (Markdown)', () => {
      const payload = formatWebhookPayload('telegram', {
        event: 'MATURING_7_DAYS',
        deposit: mockDeposit,
      });

      expect(payload.parse_mode).toBe('Markdown');
      expect(payload.text).toContain('*Bank*: HSBC Holdings');
      expect(payload.text).toContain('`HSBC-FD-9988`');
    });

    it('should validate webhook URLs and reject invalid schemes or empty inputs', () => {
      expect(validateWebhookUrl('').valid).toBe(false);
      expect(validateWebhookUrl('ftp://example.com/webhook').valid).toBe(false);
      expect(validateWebhookUrl('javascript:alert(1)').valid).toBe(false);
      expect(validateWebhookUrl('https://valid-target.com/webhook').valid).toBe(true);
      expect(validateWebhookUrl('http://localhost:8080/hook').valid).toBe(true);
    });

    it('should safely suppress delivery errors and timeout without throwing exceptions', async () => {
      // Mock fetch rejection simulating network unreachable
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      fetchSpy.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:9999'));

      const result = await sendWebhook('https://unreachable.invalid/webhook', { test: true }, { timeoutMs: 1000 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('ECONNREFUSED');
      expect(typeof result.durationMs).toBe('number');

      // Dispatch alert wrapper also safely returns false without crashing
      fetchSpy.mockRejectedValueOnce(new Error('Remote server timed out'));
      const dispatchOk = await dispatchWebhookAlert({ deposit: mockDeposit }, 'https://timeout.invalid/hook');
      expect(dispatchOk).toBe(false);

      fetchSpy.mockRestore();
    });

    it('should test webhook endpoint with valid URL and mocked successful delivery (POST /api/notifications/test-webhook)', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

      const req = new NextRequest('http://localhost:3000/api/notifications/test-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          webhookUrl: 'https://hooks.slack.com/services/T00/B00/VALID',
          channel: 'slack',
        }),
      });

      const res = await testWebhookHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.message).toMatch(/delivered successfully/i);
      expect(data.statusCode).toBe(200);

      fetchSpy.mockRestore();
    });

    it('should reject test webhook endpoint when URL is malformed or invalid protocol (400)', async () => {
      const req = new NextRequest('http://localhost:3000/api/notifications/test-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          webhookUrl: 'not-a-valid-url-format',
        }),
      });

      const res = await testWebhookHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    it('should return error response when remote webhook endpoint returns HTTP 500 without crashing', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      fetchSpy.mockResolvedValueOnce(
        new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' })
      );

      const req = new NextRequest('http://localhost:3000/api/notifications/test-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          webhookUrl: 'https://failing-remote.service/webhook',
        }),
      });

      const res = await testWebhookHandler(req);
      expect([400, 502]).toContain(res.status);
      const data = await res.json();

      expect(data.success).toBe(false);
      expect(data.error).toContain('HTTP 500');

      fetchSpy.mockRestore();
    });
  });

  // ==========================================================================
  // Section 7: Scheduled Cron Maturity Scanner API (GET & POST /api/cron/maturity-check)
  // ==========================================================================
  describe('7. Scheduled Cron Maturity Check API Handlers', () => {
    it('should allow GET /api/cron/maturity-check with session user authorization', async () => {
      const req = new NextRequest('http://localhost:3000/api/cron/maturity-check', {
        method: 'GET',
        headers: { Cookie: userACookie },
      });

      const res = await getCronHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(typeof data.scanned).toBe('number');
      expect(typeof data.alertsCreated).toBe('number');
      expect(typeof data.webhooksDispatched).toBe('number');
      expect(data.timestamp).toBeDefined();
    });

    it('should allow POST /api/cron/maturity-check with Bearer token authorization', async () => {
      const req = new NextRequest('http://localhost:3000/api/cron/maturity-check', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer assetpulse-cron-secret-token',
        },
      });

      const res = await postCronHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(typeof data.alertsCreated).toBe('number');
    });

    it('should reject cron request with 401 when in production mode with invalid credentials', async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalSecret = process.env.CRON_SECRET;
      try {
        // Simulate production environment with secret configured
        process.env.NODE_ENV = 'production';
        process.env.CRON_SECRET = 'super-secret-cron-token';

        const req = new NextRequest('http://localhost:3000/api/cron/maturity-check', {
          method: 'GET',
          headers: {
            Authorization: 'Bearer wrong-token',
          },
        });

        const res = await getCronHandler(req);
        expect(res.status).toBe(401);
        const data = await res.json();
        expect(data.error).toBe('Unauthorized');
      } finally {
        process.env.NODE_ENV = originalEnv;
        process.env.CRON_SECRET = originalSecret;
      }
    });
  });
});

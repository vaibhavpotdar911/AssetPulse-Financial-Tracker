/**
 * AssetPulse - Milestone 5 Adversarial Empirical Challenge Suite
 * File: tests/integration/notification-scanner-adversarial-challenge.test.ts
 * 
 * Executed by Challenger M5-1 (critic / specialist)
 * 
 * Empirically tests:
 * 1. Proximity scanning for:
 *    - t=0 (matures today) -> MATURED_TODAY (critical)
 *    - t=5 (1 <= t <= 7) -> MATURING_7_DAYS (warning)
 *    - t=12 (8 <= t <= 14) -> MATURING_14_DAYS (warning)
 *    - t=25 (15 <= t <= 30) -> MATURING_30_DAYS (info)
 *    - t=60 (outside horizon) -> No notification created
 *    - Exact boundary points: t=1, t=7, t=8, t=14, t=15, t=30, t=31, t=-5
 * 2. Strict Deduplication Subsystem:
 *    - Repeated consecutive scans (API & service layer) generate exactly 0 new notifications
 *    - Total notification count in DB remains unchanged
 *    - Multi-tenant deduplication isolation across distinct users
 *    - Transition to MATURED lifecycle state for t <= 0 deposits
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma, checkDatabaseConnection } from '@/lib/db';
import { createSessionToken } from '@/lib/auth';
import { scanMaturityAlertsForUser, classifyMaturityWindow } from '@/lib/notifications';
import { POST as checkNotificationsHandler } from '@/app/api/notifications/check/route';
import { GET as getNotificationsHandler } from '@/app/api/notifications/route';

describe('Milestone 5 Adversarial Empirical Challenge: Proximity Scanner & Deduplication Subsystem', () => {
  const runId = Date.now();
  let userPrimaryId: string;
  let userPrimaryCookie: string;
  let userSecondaryId: string;
  let userSecondaryCookie: string;

  // Deposit IDs for primary test suite
  let depT0Id: string;
  let depT5Id: string;
  let depT12Id: string;
  let depT25Id: string;
  let depT60Id: string;

  // Boundary Deposit IDs
  let depT1Id: string;
  let depT7Id: string;
  let depT8Id: string;
  let depT14Id: string;
  let depT15Id: string;
  let depT30Id: string;
  let depT31Id: string;
  let depTPastId: string;

  const msPerDay = 86400000;
  const now = new Date();

  beforeAll(async () => {
    const health = await checkDatabaseConnection();
    expect(health.connected).toBe(true);

    // Setup primary user
    const userA = await prisma.user.create({
      data: {
        email: `challenger_m5_pri_${runId}@assetpulse.dev`,
        password: 'PasswordPrimary123!',
        name: 'Challenger Primary M5',
      },
    });
    userPrimaryId = userA.id;
    const tokenA = await createSessionToken({ id: userA.id, email: userA.email, name: userA.name });
    userPrimaryCookie = `assetpulse_session=${tokenA}`;

    // Setup secondary user for multi-tenant isolation challenge
    const userB = await prisma.user.create({
      data: {
        email: `challenger_m5_sec_${runId}@assetpulse.dev`,
        password: 'PasswordSecondary123!',
        name: 'Challenger Secondary M5',
      },
    });
    userSecondaryId = userB.id;
    const tokenB = await createSessionToken({ id: userB.id, email: userB.email, name: userB.name });
    userSecondaryCookie = `assetpulse_session=${tokenB}`;

    // Seed deposits for primary user: Required target horizons
    // 1. t = 0 days (today)
    const d0 = await prisma.fixedDeposit.create({
      data: {
        userId: userPrimaryId,
        bankName: 'Federal Reserve Bank',
        accountNumber: 'FD-CHALLENGE-T0',
        principalAmount: 50000,
        annualRate: 5.5,
        compoundingFrequency: 'MONTHLY',
        startDate: new Date(now.getTime() - 180 * msPerDay),
        maturityDate: new Date(now.getTime()),
        maturityAmount: 51387.20,
        totalInterestEarned: 1387.20,
        status: 'ACTIVE',
      },
    });
    depT0Id = d0.id;

    // 2. t = 5 days (1 <= t <= 7)
    const d5 = await prisma.fixedDeposit.create({
      data: {
        userId: userPrimaryId,
        bankName: 'HSBC Global',
        accountNumber: 'FD-CHALLENGE-T5',
        principalAmount: 40000,
        annualRate: 6.0,
        compoundingFrequency: 'QUARTERLY',
        startDate: new Date(now.getTime() - 90 * msPerDay),
        maturityDate: new Date(now.getTime() + 5 * msPerDay),
        maturityAmount: 40600.00,
        totalInterestEarned: 600.00,
        status: 'ACTIVE',
      },
    });
    depT5Id = d5.id;

    // 3. t = 12 days (8 <= t <= 14)
    const d12 = await prisma.fixedDeposit.create({
      data: {
        userId: userPrimaryId,
        bankName: 'Barclays International',
        accountNumber: 'FD-CHALLENGE-T12',
        principalAmount: 60000,
        annualRate: 6.2,
        compoundingFrequency: 'ANNUALLY',
        startDate: new Date(now.getTime() - 350 * msPerDay),
        maturityDate: new Date(now.getTime() + 12 * msPerDay),
        maturityAmount: 63720.00,
        totalInterestEarned: 3720.00,
        status: 'ACTIVE',
      },
    });
    depT12Id = d12.id;

    // 4. t = 25 days (15 <= t <= 30)
    const d25 = await prisma.fixedDeposit.create({
      data: {
        userId: userPrimaryId,
        bankName: 'Deutsche Bank',
        accountNumber: 'FD-CHALLENGE-T25',
        principalAmount: 70000,
        annualRate: 5.8,
        compoundingFrequency: 'SEMI_ANNUALLY',
        startDate: new Date(now.getTime() - 340 * msPerDay),
        maturityDate: new Date(now.getTime() + 25 * msPerDay),
        maturityAmount: 74120.00,
        totalInterestEarned: 4120.00,
        status: 'ACTIVE',
      },
    });
    depT25Id = d25.id;

    // 5. t = 60 days (outside horizon, >30 days)
    const d60 = await prisma.fixedDeposit.create({
      data: {
        userId: userPrimaryId,
        bankName: 'Standard Chartered',
        accountNumber: 'FD-CHALLENGE-T60',
        principalAmount: 80000,
        annualRate: 6.5,
        compoundingFrequency: 'AT_MATURITY',
        startDate: new Date(now.getTime() - 305 * msPerDay),
        maturityDate: new Date(now.getTime() + 60 * msPerDay),
        maturityAmount: 85200.00,
        totalInterestEarned: 5200.00,
        status: 'ACTIVE',
      },
    });
    depT60Id = d60.id;

    // Boundary deposits for edge testing
    // t = 1 (lower bound for 7-day window)
    const d1 = await prisma.fixedDeposit.create({
      data: {
        userId: userPrimaryId,
        bankName: 'Bank Bound 1',
        accountNumber: 'FD-BOUND-T1',
        principalAmount: 10000,
        annualRate: 5.0,
        compoundingFrequency: 'MONTHLY',
        startDate: new Date(now.getTime() - 30 * msPerDay),
        maturityDate: new Date(now.getTime() + 1 * msPerDay),
        maturityAmount: 10041.67,
        totalInterestEarned: 41.67,
        status: 'ACTIVE',
      },
    });
    depT1Id = d1.id;

    // t = 7 (upper bound for 7-day window)
    const d7 = await prisma.fixedDeposit.create({
      data: {
        userId: userPrimaryId,
        bankName: 'Bank Bound 7',
        accountNumber: 'FD-BOUND-T7',
        principalAmount: 10000,
        annualRate: 5.0,
        compoundingFrequency: 'MONTHLY',
        startDate: new Date(now.getTime() - 30 * msPerDay),
        maturityDate: new Date(now.getTime() + 7 * msPerDay),
        maturityAmount: 10041.67,
        totalInterestEarned: 41.67,
        status: 'ACTIVE',
      },
    });
    depT7Id = d7.id;

    // t = 8 (lower bound for 14-day window)
    const d8 = await prisma.fixedDeposit.create({
      data: {
        userId: userPrimaryId,
        bankName: 'Bank Bound 8',
        accountNumber: 'FD-BOUND-T8',
        principalAmount: 10000,
        annualRate: 5.0,
        compoundingFrequency: 'MONTHLY',
        startDate: new Date(now.getTime() - 30 * msPerDay),
        maturityDate: new Date(now.getTime() + 8 * msPerDay),
        maturityAmount: 10041.67,
        totalInterestEarned: 41.67,
        status: 'ACTIVE',
      },
    });
    depT8Id = d8.id;

    // t = 14 (upper bound for 14-day window)
    const d14 = await prisma.fixedDeposit.create({
      data: {
        userId: userPrimaryId,
        bankName: 'Bank Bound 14',
        accountNumber: 'FD-BOUND-T14',
        principalAmount: 10000,
        annualRate: 5.0,
        compoundingFrequency: 'MONTHLY',
        startDate: new Date(now.getTime() - 30 * msPerDay),
        maturityDate: new Date(now.getTime() + 14 * msPerDay),
        maturityAmount: 10041.67,
        totalInterestEarned: 41.67,
        status: 'ACTIVE',
      },
    });
    depT14Id = d14.id;

    // t = 15 (lower bound for 30-day window)
    const d15 = await prisma.fixedDeposit.create({
      data: {
        userId: userPrimaryId,
        bankName: 'Bank Bound 15',
        accountNumber: 'FD-BOUND-T15',
        principalAmount: 10000,
        annualRate: 5.0,
        compoundingFrequency: 'MONTHLY',
        startDate: new Date(now.getTime() - 30 * msPerDay),
        maturityDate: new Date(now.getTime() + 15 * msPerDay),
        maturityAmount: 10041.67,
        totalInterestEarned: 41.67,
        status: 'ACTIVE',
      },
    });
    depT15Id = d15.id;

    // t = 30 (upper bound for 30-day window)
    const d30 = await prisma.fixedDeposit.create({
      data: {
        userId: userPrimaryId,
        bankName: 'Bank Bound 30',
        accountNumber: 'FD-BOUND-T30',
        principalAmount: 10000,
        annualRate: 5.0,
        compoundingFrequency: 'MONTHLY',
        startDate: new Date(now.getTime() - 30 * msPerDay),
        maturityDate: new Date(now.getTime() + 30 * msPerDay),
        maturityAmount: 10041.67,
        totalInterestEarned: 41.67,
        status: 'ACTIVE',
      },
    });
    depT30Id = d30.id;

    // t = 31 (just outside 30-day window)
    const d31 = await prisma.fixedDeposit.create({
      data: {
        userId: userPrimaryId,
        bankName: 'Bank Bound 31',
        accountNumber: 'FD-BOUND-T31',
        principalAmount: 10000,
        annualRate: 5.0,
        compoundingFrequency: 'MONTHLY',
        startDate: new Date(now.getTime() - 30 * msPerDay),
        maturityDate: new Date(now.getTime() + 31 * msPerDay),
        maturityAmount: 10041.67,
        totalInterestEarned: 41.67,
        status: 'ACTIVE',
      },
    });
    depT31Id = d31.id;

    // t = -5 (matured 5 days ago, overdue)
    const dPast = await prisma.fixedDeposit.create({
      data: {
        userId: userPrimaryId,
        bankName: 'Bank Past Matured',
        accountNumber: 'FD-BOUND-PAST',
        principalAmount: 10000,
        annualRate: 5.0,
        compoundingFrequency: 'MONTHLY',
        startDate: new Date(now.getTime() - 100 * msPerDay),
        maturityDate: new Date(now.getTime() - 5 * msPerDay),
        maturityAmount: 10138.00,
        totalInterestEarned: 138.00,
        status: 'ACTIVE',
      },
    });
    depTPastId = dPast.id;

    // Also seed a deposit for Secondary User (User B)
    await prisma.fixedDeposit.create({
      data: {
        userId: userSecondaryId,
        bankName: 'Secondary Bank A',
        accountNumber: 'FD-SEC-T3',
        principalAmount: 25000,
        annualRate: 6.0,
        compoundingFrequency: 'QUARTERLY',
        startDate: new Date(now.getTime() - 60 * msPerDay),
        maturityDate: new Date(now.getTime() + 3 * msPerDay),
        maturityAmount: 25250.00,
        totalInterestEarned: 250.00,
        status: 'ACTIVE',
      },
    });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({
      where: { userId: { in: [userPrimaryId, userSecondaryId] } },
    });
    await prisma.fixedDeposit.deleteMany({
      where: { userId: { in: [userPrimaryId, userSecondaryId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userPrimaryId, userSecondaryId] } },
    });
  });

  // ============================================================================
  // Test Section 1: Classification Pure Logic Unit Validation
  // ============================================================================
  describe('1. Pure Logic Window Classification', () => {
    it('should correctly classify t=0 as MATURED_TODAY with critical severity', () => {
      const result = classifyMaturityWindow(0);
      expect(result.type).toBe('MATURED_TODAY');
      expect(result.severity).toBe('critical');
    });

    it('should correctly classify t=5 as MATURING_7_DAYS with warning severity', () => {
      const result = classifyMaturityWindow(5);
      expect(result.type).toBe('MATURING_7_DAYS');
      expect(result.severity).toBe('warning');
    });

    it('should correctly classify t=12 as MATURING_14_DAYS with warning severity', () => {
      const result = classifyMaturityWindow(12);
      expect(result.type).toBe('MATURING_14_DAYS');
      expect(result.severity).toBe('warning');
    });

    it('should correctly classify t=25 as MATURING_30_DAYS with info severity', () => {
      const result = classifyMaturityWindow(25);
      expect(result.type).toBe('MATURING_30_DAYS');
      expect(result.severity).toBe('info');
    });

    it('should classify t=60 as outside horizon (null type and severity)', () => {
      const result = classifyMaturityWindow(60);
      expect(result.type).toBeNull();
      expect(result.severity).toBeNull();
    });

    it('should classify boundary cases accurately', () => {
      expect(classifyMaturityWindow(1)).toEqual({ type: 'MATURING_7_DAYS', severity: 'warning' });
      expect(classifyMaturityWindow(7)).toEqual({ type: 'MATURING_7_DAYS', severity: 'warning' });
      expect(classifyMaturityWindow(8)).toEqual({ type: 'MATURING_14_DAYS', severity: 'warning' });
      expect(classifyMaturityWindow(14)).toEqual({ type: 'MATURING_14_DAYS', severity: 'warning' });
      expect(classifyMaturityWindow(15)).toEqual({ type: 'MATURING_30_DAYS', severity: 'info' });
      expect(classifyMaturityWindow(30)).toEqual({ type: 'MATURING_30_DAYS', severity: 'info' });
      expect(classifyMaturityWindow(31)).toEqual({ type: null, severity: null });
      expect(classifyMaturityWindow(-1)).toEqual({ type: 'MATURED_TODAY', severity: 'critical' });
      expect(classifyMaturityWindow(-10)).toEqual({ type: 'MATURED_TODAY', severity: 'critical' });
    });
  });

  // ============================================================================
  // Test Section 2: Empirical Proximity Scanning in Database
  // ============================================================================
  describe('2. Empirical Proximity Scanner Execution (Initial Scan)', () => {
    it('should trigger on-demand scan via API and generate correct notifications for qualifying deposits', async () => {
      const req = new NextRequest('http://localhost:3000/api/notifications/check', {
        method: 'POST',
        headers: { Cookie: userPrimaryCookie },
      });

      const res = await checkNotificationsHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.userId).toBe(userPrimaryId);
      // Qualifying deposits:
      // t=0 (today), t=5, t=12, t=25 -> 4
      // boundaries: t=1, t=7, t=8, t=14, t=15, t=30, t=-5 (past) -> 7
      // t=60 and t=31 are outside horizon -> 0
      // Total created = 4 + 7 = 11
      expect(data.notificationsCreated).toBe(11);
      expect(data.scanned).toBe(13); // total active deposits for user

      // Verify the generated notifications in DB
      const notifs = await prisma.notification.findMany({
        where: { userId: userPrimaryId },
      });
      expect(notifs.length).toBe(11);

      // Verify Deposit t=0 (Today)
      const notifT0 = notifs.find((n) => n.depositId === depT0Id);
      expect(notifT0).toBeDefined();
      expect(notifT0?.type).toBe('MATURED_TODAY');
      expect(notifT0?.severity).toBe('critical');
      expect(notifT0?.isRead).toBe(false);
      expect(notifT0?.message).toContain('FD-CHALLENGE-T0');

      // Verify Deposit t=5 (5 days)
      const notifT5 = notifs.find((n) => n.depositId === depT5Id);
      expect(notifT5).toBeDefined();
      expect(notifT5?.type).toBe('MATURING_7_DAYS');
      expect(notifT5?.severity).toBe('warning');
      expect(notifT5?.message).toContain('FD-CHALLENGE-T5');

      // Verify Deposit t=12 (12 days)
      const notifT12 = notifs.find((n) => n.depositId === depT12Id);
      expect(notifT12).toBeDefined();
      expect(notifT12?.type).toBe('MATURING_14_DAYS');
      expect(notifT12?.severity).toBe('warning');
      expect(notifT12?.message).toContain('FD-CHALLENGE-T12');

      // Verify Deposit t=25 (25 days)
      const notifT25 = notifs.find((n) => n.depositId === depT25Id);
      expect(notifT25).toBeDefined();
      expect(notifT25?.type).toBe('MATURING_30_DAYS');
      expect(notifT25?.severity).toBe('info');
      expect(notifT25?.message).toContain('FD-CHALLENGE-T25');

      // Verify Deposit t=60 (Outside Horizon) -> ZERO notifications
      const notifT60 = notifs.find((n) => n.depositId === depT60Id);
      expect(notifT60).toBeUndefined();

      // Verify Deposit t=31 (Outside Horizon) -> ZERO notifications
      const notifT31 = notifs.find((n) => n.depositId === depT31Id);
      expect(notifT31).toBeUndefined();

      // Verify Boundary Deposits
      const notifT1 = notifs.find((n) => n.depositId === depT1Id);
      expect(notifT1?.type).toBe('MATURING_7_DAYS');
      expect(notifT1?.severity).toBe('warning');

      const notifT7 = notifs.find((n) => n.depositId === depT7Id);
      expect(notifT7?.type).toBe('MATURING_7_DAYS');
      expect(notifT7?.severity).toBe('warning');

      const notifT8 = notifs.find((n) => n.depositId === depT8Id);
      expect(notifT8?.type).toBe('MATURING_14_DAYS');
      expect(notifT8?.severity).toBe('warning');

      const notifT14 = notifs.find((n) => n.depositId === depT14Id);
      expect(notifT14?.type).toBe('MATURING_14_DAYS');
      expect(notifT14?.severity).toBe('warning');

      const notifT15 = notifs.find((n) => n.depositId === depT15Id);
      expect(notifT15?.type).toBe('MATURING_30_DAYS');
      expect(notifT15?.severity).toBe('info');

      const notifT30 = notifs.find((n) => n.depositId === depT30Id);
      expect(notifT30?.type).toBe('MATURING_30_DAYS');
      expect(notifT30?.severity).toBe('info');

      const notifPast = notifs.find((n) => n.depositId === depTPastId);
      expect(notifPast?.type).toBe('MATURED_TODAY');
      expect(notifPast?.severity).toBe('critical');

      // Verify deposit status transition for t <= 0
      const updatedT0 = await prisma.fixedDeposit.findUnique({ where: { id: depT0Id } });
      expect(updatedT0?.status).toBe('MATURED');

      const updatedPast = await prisma.fixedDeposit.findUnique({ where: { id: depTPastId } });
      expect(updatedPast?.status).toBe('MATURED');
    });
  });

  // ============================================================================
  // Test Section 3: Empirical Deduplication Subsystem Stress Test
  // ============================================================================
  describe('3. Empirical Deduplication Subsystem Consecutive Scan Challenge', () => {
    it('Scan #2: Consecutive API scan should return notificationsCreated: 0 and create 0 new records', async () => {
      const countBefore = await prisma.notification.count({ where: { userId: userPrimaryId } });

      const req = new NextRequest('http://localhost:3000/api/notifications/check', {
        method: 'POST',
        headers: { Cookie: userPrimaryCookie },
      });

      const res = await checkNotificationsHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.notificationsCreated).toBe(0);

      const countAfter = await prisma.notification.count({ where: { userId: userPrimaryId } });
      expect(countAfter).toBe(countBefore);
    });

    it('Scan #3: Consecutive library scan via scanMaturityAlertsForUser should return notificationsCreated: 0', async () => {
      const countBefore = await prisma.notification.count({ where: { userId: userPrimaryId } });

      const result = await scanMaturityAlertsForUser(userPrimaryId, { dispatchWebhooks: false });
      expect(result.notificationsCreated).toBe(0);

      const countAfter = await prisma.notification.count({ where: { userId: userPrimaryId } });
      expect(countAfter).toBe(countBefore);
    });

    it('Scan #4: Multiple consecutive rapid scans in a loop should strictly maintain 0 new notifications', async () => {
      const countBefore = await prisma.notification.count({ where: { userId: userPrimaryId } });

      for (let i = 0; i < 5; i++) {
        const result = await scanMaturityAlertsForUser(userPrimaryId, { dispatchWebhooks: false });
        expect(result.notificationsCreated).toBe(0);
      }

      const countAfter = await prisma.notification.count({ where: { userId: userPrimaryId } });
      expect(countAfter).toBe(countBefore);
    });

    it('Deduplication persists even if notifications are marked as read', async () => {
      // Mark all notifications as read
      await prisma.notification.updateMany({
        where: { userId: userPrimaryId },
        data: { isRead: true },
      });

      // Execute scan again: Should NOT re-create notifications just because they are read
      const result = await scanMaturityAlertsForUser(userPrimaryId, { dispatchWebhooks: false });
      expect(result.notificationsCreated).toBe(0);

      const count = await prisma.notification.count({ where: { userId: userPrimaryId } });
      expect(count).toBe(11);
    });
  });

  // ============================================================================
  // Test Section 4: Multi-Tenant Deduplication Isolation
  // ============================================================================
  describe('4. Multi-Tenant Deduplication Isolation Challenge', () => {
    it('Scanning secondary user should only create secondary user alerts without affecting primary user', async () => {
      const primaryCountBefore = await prisma.notification.count({ where: { userId: userPrimaryId } });
      const secondaryCountBefore = await prisma.notification.count({ where: { userId: userSecondaryId } });
      expect(secondaryCountBefore).toBe(0);

      const reqSec = new NextRequest('http://localhost:3000/api/notifications/check', {
        method: 'POST',
        headers: { Cookie: userSecondaryCookie },
      });

      const resSec = await checkNotificationsHandler(reqSec);
      expect(resSec.status).toBe(200);
      const dataSec = await resSec.json();

      expect(dataSec.userId).toBe(userSecondaryId);
      expect(dataSec.notificationsCreated).toBe(1); // t=3 deposit

      const primaryCountAfter = await prisma.notification.count({ where: { userId: userPrimaryId } });
      const secondaryCountAfter = await prisma.notification.count({ where: { userId: userSecondaryId } });

      expect(primaryCountAfter).toBe(primaryCountBefore);
      expect(secondaryCountAfter).toBe(1);

      // Subsequent scan for secondary user returns 0
      const resSec2 = await checkNotificationsHandler(reqSec);
      const dataSec2 = await resSec2.json();
      expect(dataSec2.notificationsCreated).toBe(0);
    });
  });
});

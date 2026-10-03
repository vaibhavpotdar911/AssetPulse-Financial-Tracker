/**
 * AssetPulse - SQLite Integration Test Suite
 * 
 * Verifies:
 * 1. SQLite database connectivity and dialect detection.
 * 2. Schema tables existence (User, FixedDeposit, AuditLog, Notification).
 * 3. Seed data verification (demo user, sample deposits, audit logs).
 * 4. Relational integrity, CRUD operations, and immutable audit logging.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, getDatabaseType, checkDatabaseConnection } from '@/lib/db';
import bcrypt from 'bcryptjs';

describe('SQLite Database Engine & Schema Integration', () => {
  const TEST_USER_EMAIL = `sqlite-test-${Date.now()}@assetpulse.dev`;
  let testUserId: string;
  let testDepositId: string;

  beforeAll(async () => {
    // Ensure database connection is active
    const health = await checkDatabaseConnection();
    expect(health.connected).toBe(true);
  });

  afterAll(async () => {
    // Cleanup any test user and cascade-deleted data
    if (testUserId) {
      await prisma.notification.deleteMany({ where: { userId: testUserId } });
      await prisma.auditLog.deleteMany({ where: { userId: testUserId } });
      await prisma.fixedDeposit.deleteMany({ where: { userId: testUserId } });
      await prisma.user.deleteMany({ where: { id: testUserId } });
    }
    await prisma.$disconnect();
  });

  describe('1. Connectivity & Dialect Detection', () => {
    it('should detect active SQLite dialect', () => {
      const dbType = getDatabaseType();
      expect(dbType).toBe('sqlite');
    });

    it('should execute raw health check query (SELECT 1)', async () => {
      const result = await checkDatabaseConnection();
      expect(result.connected).toBe(true);
      expect(result.provider).toBe('sqlite');
    });
  });

  describe('2. Schema Tables & Queryability', () => {
    it('should query the users table without errors', async () => {
      const count = await prisma.user.count();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should query the fixed_deposits table without errors', async () => {
      const count = await prisma.fixedDeposit.count();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should query the audit_logs table without errors', async () => {
      const count = await prisma.auditLog.count();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should query the notifications table without errors', async () => {
      const count = await prisma.notification.count();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('3. Seed Data Verification', () => {
    it('should verify demo portfolio structure if seed was executed', async () => {
      const demoUser = await prisma.user.findUnique({
        where: { email: 'demo@assetpulse.dev' },
        include: {
          deposits: true,
          auditLogs: true,
          notifications: true,
        },
      });

      // If database was seeded, verify integrity of seed portfolio
      if (demoUser) {
        expect(demoUser.email).toBe('demo@assetpulse.dev');
        expect(demoUser.name).toBe('Alex Mercer');
        expect(demoUser.deposits.length).toBeGreaterThanOrEqual(5);

        // Verify key lifecycle statuses exist in seed data
        const statuses = demoUser.deposits.map((d) => d.status);
        expect(statuses).toContain('ACTIVE');
        expect(statuses).toContain('MATURED');

        // Verify audit logs exist
        expect(demoUser.auditLogs.length).toBeGreaterThanOrEqual(1);

        // Verify notifications exist
        expect(demoUser.notifications.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('4. Full CRUD, Relational Integrity & Audit Logging', () => {
    it('should create a new test user with hashed password', async () => {
      const hashedPassword = await bcrypt.hash('TestPass123!', 10);
      const user = await prisma.user.create({
        data: {
          email: TEST_USER_EMAIL,
          name: 'SQLite Test User',
          password: hashedPassword,
        },
      });

      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.email).toBe(TEST_USER_EMAIL);
      testUserId = user.id;
    });

    it('should create a Fixed Deposit linked to the test user', async () => {
      const now = new Date();
      const maturity = new Date();
      maturity.setFullYear(maturity.getFullYear() + 1);

      const deposit = await prisma.fixedDeposit.create({
        data: {
          userId: testUserId,
          bankName: 'HDFC Bank',
          accountNumber: 'HDFC-TEST-001',
          principalAmount: 50000.0,
          annualRate: 7.5,
          compoundingFrequency: 'QUARTERLY',
          startDate: now,
          maturityDate: maturity,
          maturityAmount: 53842.19,
          totalInterestEarned: 3842.19,
          status: 'ACTIVE',
          notes: 'Test integration deposit',
        },
      });

      expect(deposit).toBeDefined();
      expect(deposit.id).toBeDefined();
      expect(deposit.userId).toBe(testUserId);
      expect(deposit.principalAmount).toBe(50000.0);
      expect(deposit.annualRate).toBe(7.5);
      testDepositId = deposit.id;
    });

    it('should record an immutable AuditLog entry for deposit creation', async () => {
      const audit = await prisma.auditLog.create({
        data: {
          userId: testUserId,
          depositId: testDepositId,
          action: 'CREATED',
          bankName: 'HDFC Bank',
          accountNumber: 'HDFC-TEST-001',
          principalAmount: 50000.0,
          notes: 'Initial creation audit log',
          snapshotData: JSON.stringify({
            bankName: 'HDFC Bank',
            principalAmount: 50000.0,
            annualRate: 7.5,
          }),
        },
      });

      expect(audit).toBeDefined();
      expect(audit.id).toBeDefined();
      expect(audit.depositId).toBe(testDepositId);
      expect(JSON.parse(audit.snapshotData).bankName).toBe('HDFC Bank');
    });

    it('should create a Notification for upcoming maturity', async () => {
      const notification = await prisma.notification.create({
        data: {
          userId: testUserId,
          depositId: testDepositId,
          type: 'MATURING_7_DAYS',
          severity: 'warning',
          title: 'Upcoming Maturity Alert',
          message: 'Your HDFC deposit will mature soon.',
          isRead: false,
        },
      });

      expect(notification).toBeDefined();
      expect(notification.isRead).toBe(false);
      expect(notification.severity).toBe('warning');
    });

    it('should preserve immutable AuditLog even if deposit reference is removed (SetNull)', async () => {
      // Simulate closure: record CLOSE audit log
      const closeAudit = await prisma.auditLog.create({
        data: {
          userId: testUserId,
          depositId: testDepositId,
          action: 'CLOSED',
          bankName: 'HDFC Bank',
          accountNumber: 'HDFC-TEST-001',
          principalAmount: 50000.0,
          realizedInterest: 3842.19,
          dispositionType: 'TRANSFERRED_SAVINGS',
          destinationAccount: 'SB-ACCOUNT-4091',
          notes: 'Closed on maturity into savings',
          snapshotData: JSON.stringify({ status: 'CLOSED' }),
        },
      });

      expect(closeAudit.action).toBe('CLOSED');
      expect(closeAudit.dispositionType).toBe('TRANSFERRED_SAVINGS');

      // Delete the deposit
      await prisma.fixedDeposit.delete({
        where: { id: testDepositId },
      });

      // Verify AuditLog persists with depositId set to null (SetNull rule)
      const fetchedAudit = await prisma.auditLog.findUnique({
        where: { id: closeAudit.id },
      });

      expect(fetchedAudit).not.toBeNull();
      expect(fetchedAudit?.depositId).toBeNull();
      expect(fetchedAudit?.action).toBe('CLOSED');
      expect(fetchedAudit?.realizedInterest).toBe(3842.19);
    });
  });
});

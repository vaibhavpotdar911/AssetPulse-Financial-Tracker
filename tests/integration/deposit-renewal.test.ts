import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma, checkDatabaseConnection } from '@/lib/db';
import { POST as createDepositHandler } from '@/app/api/deposits/route';
import { POST as renewDepositHandler } from '@/app/api/deposits/[id]/renew/route';
import { POST as createSipHandler } from '@/app/api/sips/route';
import { POST as renewSipHandler } from '@/app/api/sips/[id]/renew/route';
import { createSessionToken } from '@/lib/auth';

describe('Integration Test: Instrument Renewal Flow with Same Account Number', () => {
  const timestamp = Date.now();
  let userAId: string;
  let userBId: string;
  let userACookie: string;
  let userBCookie: string;

  beforeAll(async () => {
    const health = await checkDatabaseConnection();
    expect(health.connected).toBe(true);

    const userA = await prisma.user.create({
      data: {
        email: `renewal_alice_${timestamp}@assetpulse.dev`,
        password: 'HashedPassword123!',
        name: 'Alice Renewals',
      },
    });
    userAId = userA.id;
    const tokenA = await createSessionToken({ id: userA.id, email: userA.email, name: userA.name });
    userACookie = `assetpulse_session=${tokenA}`;

    const userB = await prisma.user.create({
      data: {
        email: `renewal_bob_${timestamp}@assetpulse.dev`,
        password: 'HashedPassword123!',
        name: 'Bob Renewals',
      },
    });
    userBId = userB.id;
    const tokenB = await createSessionToken({ id: userB.id, email: userB.email, name: userB.name });
    userBCookie = `assetpulse_session=${tokenB}`;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.fixedDeposit.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.sipExecution.deleteMany({
      where: { sipSchedule: { userId: { in: [userAId, userBId] } } },
    });
    await prisma.sipSchedule.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  });

  describe('1. Fixed Deposit Renewal Flow (POST /api/deposits/[id]/renew)', () => {
    let originalDepositId: string;
    const SHARED_ACCOUNT_NUMBER = `FD-RENEW-${timestamp}`;

    it('should create an initial fixed deposit for testing renewal', async () => {
      const req = new NextRequest('http://localhost:3000/api/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          bankName: 'HDFC Bank',
          accountNumber: SHARED_ACCOUNT_NUMBER,
          principal: 100000,
          annualRate: 6.5,
          compoundingFrequency: 'QUARTERLY',
          startDate: '2025-01-01',
          maturityDate: '2026-01-01',
        }),
      });

      const res = await createDepositHandler(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.id).toBeDefined();
      expect(data.accountNumber).toBe(SHARED_ACCOUNT_NUMBER);
      originalDepositId = data.id;
    });

    it('should reject renewal with negative principal amount (400)', async () => {
      const req = new NextRequest(`http://localhost:3000/api/deposits/${originalDepositId}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          principal: -50000,
          annualRate: 7.25,
          startDate: '2026-01-01',
          maturityDate: '2027-01-01',
        }),
      });

      const res = await renewDepositHandler(req, { params: { id: originalDepositId } });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/positive number|greater than 0/i);
    });

    it('should reject renewal when new maturity date is before or equal to new start date (400)', async () => {
      const req = new NextRequest(`http://localhost:3000/api/deposits/${originalDepositId}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          principal: 106500,
          annualRate: 7.25,
          startDate: '2026-01-01',
          maturityDate: '2025-12-31',
        }),
      });

      const res = await renewDepositHandler(req, { params: { id: originalDepositId } });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/strictly after/i);
    });

    it('should strictly return 404 when User B attempts to renew User A deposit (Multi-Tenant Isolation)', async () => {
      const req = new NextRequest(`http://localhost:3000/api/deposits/${originalDepositId}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userBCookie },
        body: JSON.stringify({
          principal: 106500,
          annualRate: 7.25,
          startDate: '2026-01-01',
          maturityDate: '2027-01-01',
        }),
      });

      const res = await renewDepositHandler(req, { params: { id: originalDepositId } });
      expect(res.status).toBe(404);
    });

    it('should successfully renew the deposit with the SAME account number, new tenure, and new interest rate', async () => {
      const req = new NextRequest(`http://localhost:3000/api/deposits/${originalDepositId}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          principal: 106660, // Rolled over principal + interest
          annualRate: 7.75, // Updated interest rate
          compoundingFrequency: 'QUARTERLY',
          startDate: '2026-01-01',
          maturityDate: '2028-01-01', // New 2-year tenure
          isAutoRenew: true,
          notes: 'Customer renewed certificate at revised special interest rate.',
          rolloverOption: 'FULL_ROLLOVER',
        }),
      });

      const res = await renewDepositHandler(req, { params: { id: originalDepositId } });
      expect(res.status).toBe(201);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.deposit).toBeDefined();

      const renewedDeposit = data.deposit;
      expect(renewedDeposit.id).not.toBe(originalDepositId);
      // KEY REQUIREMENT: Same account number!
      expect(renewedDeposit.accountNumber).toBe(SHARED_ACCOUNT_NUMBER);
      expect(renewedDeposit.bankName).toBe('HDFC Bank');
      expect(renewedDeposit.annualRate).toBe(7.75);
      expect(renewedDeposit.principalAmount).toBe(106660);
      expect(renewedDeposit.status).toBe('ACTIVE');
      expect(renewedDeposit.isAutoRenew).toBe(true);

      // Verify the prior deposit is now CLOSED with MATURED_REINVESTED
      const oldInDb = await prisma.fixedDeposit.findUnique({
        where: { id: originalDepositId },
      });
      expect(oldInDb?.status).toBe('CLOSED');

      // Verify audit logs
      const closeAudit = await prisma.auditLog.findFirst({
        where: { depositId: originalDepositId, action: 'CLOSED' },
      });
      expect(closeAudit).not.toBeNull();
      expect(closeAudit?.dispositionType).toBe('MATURED_REINVESTED');
      expect(closeAudit?.accountNumber).toBe(SHARED_ACCOUNT_NUMBER);

      const createAudit = await prisma.auditLog.findFirst({
        where: { depositId: renewedDeposit.id, action: 'CREATED' },
      });
      expect(createAudit).not.toBeNull();
      expect(createAudit?.accountNumber).toBe(SHARED_ACCOUNT_NUMBER);
      expect(createAudit?.principalAmount).toBe(106660);

      // Verify both deposits exist simultaneously under User A with the same account number
      const allMatching = await prisma.fixedDeposit.findMany({
        where: { userId: userAId, accountNumber: SHARED_ACCOUNT_NUMBER },
      });
      expect(allMatching.length).toBe(2);
      const statuses = allMatching.map((d) => d.status);
      expect(statuses).toContain('CLOSED');
      expect(statuses).toContain('ACTIVE');
    });
  });

  describe('2. Recurring Deposit / SIP Renewal Flow (POST /api/sips/[id]/renew)', () => {
    let originalSipId: string;
    const SHARED_FOLIO_NUMBER = `RD-FOLIO-${timestamp}`;

    it('should create an initial recurring deposit', async () => {
      const req = new NextRequest('http://localhost:3000/api/sips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          name: 'SBI 1-Year Recurring Deposit',
          assetType: 'RECURRING_DEPOSIT',
          frequency: 'MONTHLY',
          installmentAmount: 5000,
          annualRate: '6.8',
          tenureMonths: '12',
          compoundingFrequency: 'QUARTERLY',
          folioNumber: SHARED_FOLIO_NUMBER,
          startDate: '2025-01-01',
        }),
      });

      const res = await createSipHandler(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.sip.id).toBeDefined();
      expect(data.sip.folioNumber).toBe(SHARED_FOLIO_NUMBER);
      originalSipId = data.sip.id;
    });

    it('should renew the RD with the SAME folio / account number to a new tenure and interest rate', async () => {
      const req = new NextRequest(`http://localhost:3000/api/sips/${originalSipId}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          installmentAmount: 6000, // Increased monthly installment
          annualRate: '7.4', // Revised interest rate
          tenureMonths: '24', // Extended 24 months tenure
          startDate: '2026-01-01',
          notes: 'Customer renewed RD for 24 months at 7.4% under same folio.',
        }),
      });

      const res = await renewSipHandler(req, { params: { id: originalSipId } });
      expect(res.status).toBe(201);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.sip).toBeDefined();

      const renewed = data.sip;
      expect(renewed.id).not.toBe(originalSipId);
      expect(renewed.folioNumber).toBe(SHARED_FOLIO_NUMBER); // Preserved identical folio/account
      expect(renewed.installmentAmount).toBe(6000);
      expect(renewed.annualRate).toBe(7.4);
      expect(renewed.tenureMonths).toBe(24);
      expect(renewed.status).toBe('ACTIVE');

      // Verify original schedule is marked COMPLETED
      const oldSip = await prisma.sipSchedule.findUnique({
        where: { id: originalSipId },
      });
      expect(oldSip?.status).toBe('COMPLETED');
    });
  });
});

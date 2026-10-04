/**
 * Adversarial Empirical Challenge Suite for Milestone 4:
 * Fixed Deposits Portfolio CRUD & Immutable Audit Ledger
 * 
 * Executed by Challenger M4-1 (critic / specialist)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma, checkDatabaseConnection } from '@/lib/db';
import { GET as getDepositsHandler, POST as createDepositHandler } from '@/app/api/deposits/route';
import {
  GET as getDepositHandler,
  PUT as updateDepositHandler,
  DELETE as deleteDepositHandler,
} from '@/app/api/deposits/[id]/route';
import { POST as closeDepositHandler } from '@/app/api/deposits/[id]/close/route';
import {
  GET as getAuditLogsHandler,
  POST as postAuditLogsHandler,
  PUT as putAuditLogsHandler,
  DELETE as deleteAuditLogsHandler,
  PATCH as patchAuditLogsHandler,
} from '@/app/api/audit-logs/route';
import {
  GET as getAuditLogByIdHandler,
  PUT as putAuditLogByIdHandler,
  DELETE as deleteAuditLogByIdHandler,
} from '@/app/api/audit-logs/[id]/route';
import { createSessionToken } from '@/lib/auth';

describe('Empirical Adversarial Challenge Suite: Milestone 4 FD Portfolio & Audit Ledger', () => {
  const runId = Date.now();
  let userAId: string;
  let userBId: string;
  let userACookie: string;
  let userBCookie: string;

  beforeAll(async () => {
    const health = await checkDatabaseConnection();
    expect(health.connected).toBe(true);

    // Setup Test User A
    const userA = await prisma.user.create({
      data: {
        email: `challenger_m4_a_${runId}@assetpulse.dev`,
        password: 'HashedPasswordTest123!',
        name: 'Challenger Alpha',
      },
    });
    userAId = userA.id;
    const tokenA = await createSessionToken({ id: userA.id, email: userA.email, name: userA.name });
    userACookie = `assetpulse_session=${tokenA}`;

    // Setup Test User B
    const userB = await prisma.user.create({
      data: {
        email: `challenger_m4_b_${runId}@assetpulse.dev`,
        password: 'HashedPasswordTest123!',
        name: 'Challenger Beta',
      },
    });
    userBId = userB.id;
    const tokenB = await createSessionToken({ id: userB.id, email: userB.email, name: userB.name });
    userBCookie = `assetpulse_session=${tokenB}`;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.fixedDeposit.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  });

  // ==========================================================================
  // Section 1: Challenge CRUD Lifecycle & Validation Constraints
  // ==========================================================================
  describe('1. CRUD Lifecycle & Validation Constraints Boundary Challenges', () => {
    it('should reject creation when principal is <= 0 (principal: 0, negative)', async () => {
      // principal = 0
      const reqZero = new NextRequest('http://localhost:3000/api/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          bankName: 'Test Bank',
          accountNumber: 'ACC-ZERO',
          principal: 0,
          annualRate: 5.5,
          compoundingFrequency: 'ANNUALLY',
          startDate: '2026-01-01',
          maturityDate: '2027-01-01',
        }),
      });
      const resZero = await createDepositHandler(reqZero);
      expect(resZero.status).toBe(400);

      // principal = -500
      const reqNeg = new NextRequest('http://localhost:3000/api/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          bankName: 'Test Bank',
          accountNumber: 'ACC-NEG',
          principal: -500,
          annualRate: 5.5,
          compoundingFrequency: 'ANNUALLY',
          startDate: '2026-01-01',
          maturityDate: '2027-01-01',
        }),
      });
      const resNeg = await createDepositHandler(reqNeg);
      expect(resNeg.status).toBe(400);

      // principalAmount = 0
      const reqZeroAlt = new NextRequest('http://localhost:3000/api/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          bankName: 'Test Bank',
          accountNumber: 'ACC-ZERO-ALT',
          principalAmount: 0,
          annualRate: 5.5,
          compoundingFrequency: 'ANNUALLY',
          startDate: '2026-01-01',
          maturityDate: '2027-01-01',
        }),
      });
      const resZeroAlt = await createDepositHandler(reqZeroAlt);
      expect(resZeroAlt.status).toBe(400);
    });

    it('should reject creation when annualRate is negative (< 0)', async () => {
      const reqNegRate = new NextRequest('http://localhost:3000/api/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          bankName: 'Test Bank',
          accountNumber: 'ACC-NEG-RATE',
          principal: 10000,
          annualRate: -0.5,
          compoundingFrequency: 'ANNUALLY',
          startDate: '2026-01-01',
          maturityDate: '2027-01-01',
        }),
      });
      const resNegRate = await createDepositHandler(reqNegRate);
      expect(resNegRate.status).toBe(400);
      const data = await resNegRate.json();
      expect(data.error).toMatch(/negative/i);
    });

    it('should reject creation when maturityDate <= startDate (same day and reversed)', async () => {
      // Same day (maturityDate == startDate)
      const reqSame = new NextRequest('http://localhost:3000/api/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          bankName: 'Test Bank',
          accountNumber: 'ACC-SAME-DATE',
          principal: 10000,
          annualRate: 6.0,
          compoundingFrequency: 'MONTHLY',
          startDate: '2026-05-15',
          maturityDate: '2026-05-15',
        }),
      });
      const resSame = await createDepositHandler(reqSame);
      expect(resSame.status).toBe(400);
      const dataSame = await resSame.json();
      expect(dataSame.error).toMatch(/strictly after/i);

      // Reversed (maturityDate < startDate)
      const reqRev = new NextRequest('http://localhost:3000/api/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          bankName: 'Test Bank',
          accountNumber: 'ACC-REV-DATE',
          principal: 10000,
          annualRate: 6.0,
          compoundingFrequency: 'MONTHLY',
          startDate: '2026-06-01',
          maturityDate: '2026-01-01',
        }),
      });
      const resRev = await createDepositHandler(reqRev);
      expect(resRev.status).toBe(400);
    });

    it('should reject invalid compounding frequencies', async () => {
      const invalidFreqs = ['DAILY', 'HOURLY', 'WEEKLY', 'INVALID_FREQUENCY', ''];
      for (const freq of invalidFreqs) {
        const req = new NextRequest('http://localhost:3000/api/deposits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: userACookie },
          body: JSON.stringify({
            bankName: 'Test Bank',
            accountNumber: `ACC-FREQ-${freq || 'EMPTY'}`,
            principal: 10000,
            annualRate: 5.0,
            compoundingFrequency: freq,
            startDate: '2026-01-01',
            maturityDate: '2027-01-01',
          }),
        });
        const res = await createDepositHandler(req);
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toMatch(/compounding frequency/i);
      }
    });

    it('should reject creation when required bankName or accountNumber are blank or whitespace', async () => {
      const reqBlankBank = new NextRequest('http://localhost:3000/api/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          bankName: '   ',
          accountNumber: 'ACC-123',
          principal: 10000,
          annualRate: 5.0,
          compoundingFrequency: 'ANNUALLY',
          startDate: '2026-01-01',
          maturityDate: '2027-01-01',
        }),
      });
      const resBlankBank = await createDepositHandler(reqBlankBank);
      expect(resBlankBank.status).toBe(400);

      const reqBlankAcc = new NextRequest('http://localhost:3000/api/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          bankName: 'Valid Bank',
          accountNumber: '   ',
          principal: 10000,
          annualRate: 5.0,
          compoundingFrequency: 'ANNUALLY',
          startDate: '2026-01-01',
          maturityDate: '2027-01-01',
        }),
      });
      const resBlankAcc = await createDepositHandler(reqBlankAcc);
      expect(resBlankAcc.status).toBe(400);
    });

    it('should reject malformed JSON bodies', async () => {
      const req = new NextRequest('http://localhost:3000/api/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: 'invalid-json-{broken}',
      });
      const res = await createDepositHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/invalid json/i);
    });

    it('should reject editing a closed or liquidated deposit with 400', async () => {
      // 1. Create a deposit
      const createReq = new NextRequest('http://localhost:3000/api/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          bankName: 'Barclays UK',
          accountNumber: 'BARC-EDIT-TEST-01',
          principal: 25000,
          annualRate: 6.2,
          compoundingFrequency: 'QUARTERLY',
          startDate: '2026-01-01',
          maturityDate: '2027-01-01',
        }),
      });
      const createRes = await createDepositHandler(createReq);
      expect(createRes.status).toBe(201);
      const deposit = await createRes.json();

      // 2. Close deposit
      const closeReq = new NextRequest(`http://localhost:3000/api/deposits/${deposit.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          dispositionType: 'TRANSFERRED_SAVINGS',
          destinationAccount: 'SAVINGS-999',
          realizedInterest: 1000,
          penaltyAmount: 0,
        }),
      });
      const closeRes = await closeDepositHandler(closeReq, { params: { id: deposit.id } });
      expect(closeRes.status).toBe(200);

      // 3. Attempt to PUT (update) the closed deposit
      const editReq = new NextRequest(`http://localhost:3000/api/deposits/${deposit.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          annualRate: 7.0,
        }),
      });
      const editRes = await updateDepositHandler(editReq, { params: { id: deposit.id } });
      expect(editRes.status).toBe(400);
      const editData = await editRes.json();
      expect(editData.error).toMatch(/closed or liquidated/i);
    });
  });

  // ==========================================================================
  // Section 2: Challenge Dynamic Financial Metric Enrichment & Dual Fields
  // ==========================================================================
  describe('2. Dynamic Financial Metric Enrichment & Compatibility Challenges', () => {
    let testDepositId: string;
    let maturedDepositId: string;

    beforeAll(async () => {
      // Create Active deposit (1-year tenure)
      const resActive = await createDepositHandler(
        new NextRequest('http://localhost:3000/api/deposits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: userACookie },
          body: JSON.stringify({
            bankName: 'HSBC Holdings',
            accountNumber: 'HSBC-ENRICH-01',
            principalAmount: 50000,
            annualRate: 7.0,
            compoundingFrequency: 'MONTHLY',
            startDate: '2026-01-01',
            maturityDate: '2027-01-01',
          }),
        })
      );
      expect(resActive.status).toBe(201);
      const activeData = await resActive.json();
      testDepositId = activeData.id;

      // Create Matured deposit (past maturity date)
      const resMatured = await createDepositHandler(
        new NextRequest('http://localhost:3000/api/deposits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: userACookie },
          body: JSON.stringify({
            bankName: 'Deutsche Bank',
            accountNumber: 'DB-MATURED-01',
            principal: 20000,
            annualRate: 5.0,
            compoundingFrequency: 'ANNUALLY',
            startDate: '2023-01-01',
            maturityDate: '2024-01-01',
          }),
        })
      );
      expect(resMatured.status).toBe(201);
      const maturedData = await resMatured.json();
      maturedDepositId = maturedData.id;
    });

    it('should verify dual compatibility of principal and principalAmount in POST and GET', async () => {
      const getSingleReq = new NextRequest(`http://localhost:3000/api/deposits/${testDepositId}`, {
        method: 'GET',
        headers: { Cookie: userACookie },
      });
      const getSingleRes = await getDepositHandler(getSingleReq, { params: { id: testDepositId } });
      expect(getSingleRes.status).toBe(200);
      const single = await getSingleRes.json();

      expect(single.principal).toBe(50000);
      expect(single.principalAmount).toBe(50000);
      expect(single.principal).toBe(single.principalAmount);

      // Verify in list GET /api/deposits
      const getListReq = new NextRequest('http://localhost:3000/api/deposits', {
        method: 'GET',
        headers: { Cookie: userACookie },
      });
      const getListRes = await getDepositsHandler(getListReq);
      expect(getListRes.status).toBe(200);
      const list = await getListRes.json();

      const found = list.find((d: any) => d.id === testDepositId);
      expect(found).toBeDefined();
      expect(found.principal).toBe(50000);
      expect(found.principalAmount).toBe(50000);
    });

    it('should compute accruedInterest, daysRemaining, progressPercentage, maturityAmount, isMatured accurately', async () => {
      const getSingleReq = new NextRequest(`http://localhost:3000/api/deposits/${testDepositId}`, {
        method: 'GET',
        headers: { Cookie: userACookie },
      });
      const getSingleRes = await getDepositHandler(getSingleReq, { params: { id: testDepositId } });
      const deposit = await getSingleRes.json();

      expect(typeof deposit.accruedInterest).toBe('number');
      expect(typeof deposit.daysRemaining).toBe('number');
      expect(typeof deposit.progressPercentage).toBe('number');
      expect(typeof deposit.maturityAmount).toBe('number');
      expect(typeof deposit.isMatured).toBe('boolean');

      // Maturity amount for $50,000 at 7% monthly over 1 year = 50000 * (1 + 0.07/12)^12 = 53614.49
      expect(deposit.maturityAmount).toBeCloseTo(53614.49, 0.1);
      expect(deposit.totalInterestEarned).toBeCloseTo(3614.49, 0.1);

      // Bound checks
      expect(deposit.accruedInterest).toBeGreaterThanOrEqual(0);
      expect(deposit.accruedInterest).toBeLessThanOrEqual(deposit.totalInterestEarned);
      expect(deposit.progressPercentage).toBeGreaterThanOrEqual(0);
      expect(deposit.progressPercentage).toBeLessThanOrEqual(100);
    });

    it('should correctly mark already matured deposits: isMatured = true, daysRemaining = 0, progress = 100', async () => {
      const getMaturedReq = new NextRequest(`http://localhost:3000/api/deposits/${maturedDepositId}`, {
        method: 'GET',
        headers: { Cookie: userACookie },
      });
      const getMaturedRes = await getDepositHandler(getMaturedReq, { params: { id: maturedDepositId } });
      expect(getMaturedRes.status).toBe(200);
      const deposit = await getMaturedRes.json();

      expect(deposit.isMatured).toBe(true);
      expect(deposit.daysRemaining).toBe(0);
      expect(deposit.progressPercentage).toBe(100);
      expect(deposit.accruedInterest).toBeCloseTo(deposit.totalInterestEarned, 0.01);
    });
  });

  // ==========================================================================
  // Section 3: Challenge Disposition & Premature Liquidation
  // ==========================================================================
  describe('3. Disposition & Premature Liquidation Challenges', () => {
    it('should handle premature liquidation with penalty > 0, compute netProceeds, set status LIQUIDATED and write audit', async () => {
      // 1. Create a new deposit
      const createRes = await createDepositHandler(
        new NextRequest('http://localhost:3000/api/deposits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: userACookie },
          body: JSON.stringify({
            bankName: 'Citibank N.A.',
            accountNumber: 'CITI-LIQ-01',
            principal: 100000,
            annualRate: 6.0,
            compoundingFrequency: 'QUARTERLY',
            startDate: '2026-01-01',
            maturityDate: '2028-01-01',
          }),
        })
      );
      expect(createRes.status).toBe(201);
      const deposit = await createRes.json();

      // 2. Liquidate prematurely with penalty
      const penalty = 500;
      const realizedInterest = 2500;
      const expectedNetProceeds = 100000 + 2500 - 500; // 102000

      const closeReq = new NextRequest(`http://localhost:3000/api/deposits/${deposit.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          dispositionType: 'PREMATURE_WITHDRAWAL',
          destinationAccount: 'CITI-CHECKING-001',
          realizedInterest,
          penaltyAmount: penalty,
          notes: 'Emergency premature withdrawal for medical expense',
        }),
      });

      const closeRes = await closeDepositHandler(closeReq, { params: { id: deposit.id } });
      expect(closeRes.status).toBe(200);
      const closeData = await closeRes.json();

      expect(closeData.status).toBe('LIQUIDATED');
      expect(closeData.netProceeds).toBe(expectedNetProceeds);
      expect(closeData.penaltyAmount).toBe(penalty);
      expect(closeData.realizedInterest).toBe(realizedInterest);

      // Verify in DB
      const dbDeposit = await prisma.fixedDeposit.findUnique({ where: { id: deposit.id } });
      expect(dbDeposit?.status).toBe('LIQUIDATED');

      // Verify Audit Log recorded with action LIQUIDATED
      const audit = await prisma.auditLog.findFirst({
        where: { depositId: deposit.id, action: 'LIQUIDATED' },
      });
      expect(audit).not.toBeNull();
      expect(audit?.principalAmount).toBe(100000);
      expect(audit?.realizedInterest).toBe(realizedInterest);
      expect(audit?.penaltyAmount).toBe(penalty);
      expect(audit?.destinationAccount).toBe('CITI-CHECKING-001');
      expect(audit?.dispositionType).toBe('PREMATURE_WITHDRAWAL');
    });

    it('should reject closure when penalty amount exceeds principal + realizedInterest', async () => {
      // Create deposit
      const createRes = await createDepositHandler(
        new NextRequest('http://localhost:3000/api/deposits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: userACookie },
          body: JSON.stringify({
            bankName: 'Wells Fargo',
            accountNumber: 'WF-PENALTY-EXCEED',
            principal: 5000,
            annualRate: 4.0,
            compoundingFrequency: 'ANNUALLY',
            startDate: '2026-01-01',
            maturityDate: '2027-01-01',
          }),
        })
      );
      const deposit = await createRes.json();

      // Attempt liquidation with penalty > total funds ($10,000 penalty on $5,000 principal)
      const closeReq = new NextRequest(`http://localhost:3000/api/deposits/${deposit.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          dispositionType: 'PREMATURE_WITHDRAWAL',
          realizedInterest: 100,
          penaltyAmount: 10000,
        }),
      });
      const closeRes = await closeDepositHandler(closeReq, { params: { id: deposit.id } });
      expect(closeRes.status).toBe(400);
      const closeData = await closeRes.json();
      expect(closeData.error).toMatch(/exceed/i);
    });

    it('should reject closing an already closed or liquidated deposit', async () => {
      // Create deposit
      const createRes = await createDepositHandler(
        new NextRequest('http://localhost:3000/api/deposits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: userACookie },
          body: JSON.stringify({
            bankName: 'Bank of America',
            accountNumber: 'BOA-DOUBLE-CLOSE',
            principal: 10000,
            annualRate: 5.0,
            compoundingFrequency: 'ANNUALLY',
            startDate: '2026-01-01',
            maturityDate: '2027-01-01',
          }),
        })
      );
      const deposit = await createRes.json();

      // First close - success
      const close1 = await closeDepositHandler(
        new NextRequest(`http://localhost:3000/api/deposits/${deposit.id}/close`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: userACookie },
          body: JSON.stringify({ dispositionType: 'MATURED_REINVESTED' }),
        }),
        { params: { id: deposit.id } }
      );
      expect(close1.status).toBe(200);

      // Second close - must return 400
      const close2 = await closeDepositHandler(
        new NextRequest(`http://localhost:3000/api/deposits/${deposit.id}/close`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: userACookie },
          body: JSON.stringify({ dispositionType: 'MATURED_REINVESTED' }),
        }),
        { params: { id: deposit.id } }
      );
      expect(close2.status).toBe(400);
      const close2Data = await close2.json();
      expect(close2Data.error).toMatch(/already closed/i);
    });
  });

  // ==========================================================================
  // Section 4: Challenge Multi-Tenant Isolation & ID Enumeration Prevention
  // ==========================================================================
  describe('4. Multi-Tenant Isolation & Uniform 404 IDOR Protection', () => {
    let userADepositId: string;

    beforeAll(async () => {
      const res = await createDepositHandler(
        new NextRequest('http://localhost:3000/api/deposits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: userACookie },
          body: JSON.stringify({
            bankName: 'Secret Swiss Private Bank',
            accountNumber: 'CH-PRIVATE-777',
            principal: 1000000,
            annualRate: 4.5,
            compoundingFrequency: 'ANNUALLY',
            startDate: '2026-01-01',
            maturityDate: '2027-01-01',
          }),
        })
      );
      const data = await res.json();
      userADepositId = data.id;
    });

    it('should return uniform 404 when User B queries User A deposit via GET /api/deposits/[id]', async () => {
      const req = new NextRequest(`http://localhost:3000/api/deposits/${userADepositId}`, {
        method: 'GET',
        headers: { Cookie: userBCookie },
      });
      const res = await getDepositHandler(req, { params: { id: userADepositId } });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('Deposit not found');
    });

    it('should return uniform 404 when User B attempts to mutate User A deposit via PUT /api/deposits/[id]', async () => {
      const req = new NextRequest(`http://localhost:3000/api/deposits/${userADepositId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: userBCookie },
        body: JSON.stringify({ annualRate: 99.0 }),
      });
      const res = await updateDepositHandler(req, { params: { id: userADepositId } });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('Deposit not found');
    });

    it('should return uniform 404 when User B attempts to close User A deposit via POST /api/deposits/[id]/close', async () => {
      const req = new NextRequest(`http://localhost:3000/api/deposits/${userADepositId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userBCookie },
        body: JSON.stringify({ dispositionType: 'PREMATURE_WITHDRAWAL' }),
      });
      const res = await closeDepositHandler(req, { params: { id: userADepositId } });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('Deposit not found');
    });

    it('should return uniform 404 when User B attempts to delete User A deposit via DELETE /api/deposits/[id]', async () => {
      const req = new NextRequest(`http://localhost:3000/api/deposits/${userADepositId}`, {
        method: 'DELETE',
        headers: { Cookie: userBCookie },
      });
      const res = await deleteDepositHandler(req, { params: { id: userADepositId } });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('Deposit not found');
    });

    it('should never include User A deposits in User B GET /api/deposits response', async () => {
      const req = new NextRequest('http://localhost:3000/api/deposits', {
        method: 'GET',
        headers: { Cookie: userBCookie },
      });
      const res = await getDepositsHandler(req);
      expect(res.status).toBe(200);
      const deposits = await res.json();
      const leaked = deposits.find((d: any) => d.id === userADepositId);
      expect(leaked).toBeUndefined();
    });

    it('should strip injected userId upon deposit creation preventing tenant hijacking', async () => {
      // User B attempts to create deposit attributing it to User A
      const req = new NextRequest('http://localhost:3000/api/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userBCookie },
        body: JSON.stringify({
          userId: userAId, // Attempted hijacking
          bankName: 'Attempted Hijack Bank',
          accountNumber: 'HIJACK-01',
          principal: 10000,
          annualRate: 5.0,
          compoundingFrequency: 'ANNUALLY',
          startDate: '2026-01-01',
          maturityDate: '2027-01-01',
        }),
      });
      const res = await createDepositHandler(req);
      expect(res.status).toBe(201);
      const created = await res.json();

      // Must be owned by User B, not User A!
      const dbDeposit = await prisma.fixedDeposit.findUnique({ where: { id: created.id } });
      expect(dbDeposit?.userId).toBe(userBId);
      expect(dbDeposit?.userId).not.toBe(userAId);
    });
  });

  // ==========================================================================
  // Section 5: Challenge Audit Ledger Immutability & 405 Guards
  // ==========================================================================
  describe('5. Audit Ledger Immutability & 405 Method Guards', () => {
    it('should reject direct POST to /api/audit-logs with 405 Method Not Allowed', async () => {
      const res = await postAuditLogsHandler();
      expect(res.status).toBe(405);
      expect(res.headers.get('Allow')).toBe('GET');
      const data = await res.json();
      expect(data.error).toBe('Method Not Allowed');
    });

    it('should reject direct PUT, PATCH, DELETE to /api/audit-logs with 405 Method Not Allowed', async () => {
      const resPut = await putAuditLogsHandler();
      expect(resPut.status).toBe(405);
      expect(resPut.headers.get('Allow')).toBe('GET');

      const resPatch = await patchAuditLogsHandler();
      expect(resPatch.status).toBe(405);
      expect(resPatch.headers.get('Allow')).toBe('GET');

      const resDelete = await deleteAuditLogsHandler();
      expect(resDelete.status).toBe(405);
      expect(resDelete.headers.get('Allow')).toBe('GET');
    });

    it('should reject direct PUT and DELETE to /api/audit-logs/[id] with 405 Method Not Allowed', async () => {
      const resPut = await putAuditLogByIdHandler();
      expect(resPut.status).toBe(405);
      expect(resPut.headers.get('Allow')).toBe('GET');

      const resDelete = await deleteAuditLogByIdHandler();
      expect(resDelete.status).toBe(405);
      expect(resDelete.headers.get('Allow')).toBe('GET');
    });
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma, checkDatabaseConnection } from '@/lib/db';
import { GET as getDepositsHandler, POST as createDepositHandler } from '@/app/api/deposits/route';
import { GET as getDepositHandler, PUT as updateDepositHandler, DELETE as deleteDepositHandler } from '@/app/api/deposits/[id]/route';
import { POST as closeDepositHandler } from '@/app/api/deposits/[id]/close/route';
import { createSessionToken } from '@/lib/auth';

describe('Integration Test: Fixed Deposits API Routes & Lifecycle', () => {
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
        email: `fd_user_a_${timestamp}@assetpulse.dev`,
        password: 'HashedPassword123!',
        name: 'Alice Deposits',
      },
    });
    userAId = userA.id;
    const tokenA = await createSessionToken({ id: userA.id, email: userA.email, name: userA.name });
    userACookie = `assetpulse_session=${tokenA}`;

    const userB = await prisma.user.create({
      data: {
        email: `fd_user_b_${timestamp}@assetpulse.dev`,
        password: 'HashedPassword123!',
        name: 'Bob Deposits',
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

  describe('1. Input Validation Constraints (POST /api/deposits)', () => {
    it('should reject creation with negative principal amount (400)', async () => {
      const req = new NextRequest('http://localhost:3000/api/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          bankName: 'JPMorgan Chase',
          accountNumber: 'INV-NEG-01',
          principal: -10000,
          annualRate: 5.0,
          compoundingFrequency: 'ANNUALLY',
          startDate: '2026-01-01',
          maturityDate: '2027-01-01',
        }),
      });

      const res = await createDepositHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/positive number|greater than 0/i);
    });

    it('should reject creation when maturity date is before or equal to start date (400)', async () => {
      const req = new NextRequest('http://localhost:3000/api/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          bankName: 'JPMorgan Chase',
          accountNumber: 'INV-DATE-02',
          principal: 50000,
          annualRate: 5.0,
          compoundingFrequency: 'ANNUALLY',
          startDate: '2026-06-01',
          maturityDate: '2026-05-01',
        }),
      });

      const res = await createDepositHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/strictly after/i);
    });

    it('should reject creation when bankName or accountNumber is missing (400)', async () => {
      const req = new NextRequest('http://localhost:3000/api/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          accountNumber: 'INV-BANK-03',
          principal: 50000,
          annualRate: 5.0,
          compoundingFrequency: 'ANNUALLY',
          startDate: '2026-01-01',
          maturityDate: '2027-01-01',
        }),
      });

      const res = await createDepositHandler(req);
      expect(res.status).toBe(400);
    });
  });

  describe('2. Successful CRUD Lifecycle & Real-Time Dynamic Metrics', () => {
    let createdDepositId: string;

    it('should create a valid quarterly deposit, pre-calculate maturity values, and write audit log', async () => {
      const req = new NextRequest('http://localhost:3000/api/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          bankName: 'Standard Chartered',
          accountNumber: 'SCB-FD-1001',
          principal: 100000,
          annualRate: 7.5,
          compoundingFrequency: 'QUARTERLY',
          startDate: '2026-01-01',
          maturityDate: '2027-01-01',
        }),
      });

      const res = await createDepositHandler(req);
      expect(res.status).toBe(201);
      const data = await res.json();

      expect(data.id).toBeDefined();
      expect(data.bankName).toBe('Standard Chartered');
      expect(data.maturityAmount).toBeCloseTo(107713.59, 0.05);
      expect(data.totalInterestEarned).toBeCloseTo(7713.59, 0.05);
      expect(data.status).toBe('ACTIVE');

      createdDepositId = data.id;

      // Verify audit log created
      const audit = await prisma.auditLog.findFirst({
        where: { depositId: createdDepositId, action: 'CREATED' },
      });
      expect(audit).not.toBeNull();
      expect(audit?.bankName).toBe('Standard Chartered');
      expect(audit?.principalAmount).toBe(100000);
    });

    it('should retrieve deposit list with dynamic real-time calculations', async () => {
      const req = new NextRequest('http://localhost:3000/api/deposits', {
        method: 'GET',
        headers: { Cookie: userACookie },
      });

      const res = await getDepositsHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(Array.isArray(data)).toBe(true);
      const found = data.find((d: any) => d.id === createdDepositId);
      expect(found).toBeDefined();
      expect(found.accruedInterest).toBeDefined();
      expect(found.daysRemaining).toBeDefined();
      expect(found.progressPercentage).toBeDefined();
      expect(found.principal).toBe(100000);
      expect(found.principalAmount).toBe(100000);
    });

    it('should retrieve single deposit by ID', async () => {
      const req = new NextRequest(`http://localhost:3000/api/deposits/${createdDepositId}`, {
        method: 'GET',
        headers: { Cookie: userACookie },
      });

      const res = await getDepositHandler(req, { params: { id: createdDepositId } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe(createdDepositId);
      expect(data.bankName).toBe('Standard Chartered');
    });

    it('should update deposit interest rate and automatically recalculate maturity amount', async () => {
      const req = new NextRequest(`http://localhost:3000/api/deposits/${createdDepositId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          annualRate: 8.0,
        }),
      });

      const res = await updateDepositHandler(req, { params: { id: createdDepositId } });
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.annualRate).toBe(8.0);
      expect(data.maturityAmount).toBeCloseTo(108243.22, 0.05);

      // Verify UPDATED audit log with snapshot
      const updateAudit = await prisma.auditLog.findFirst({
        where: { depositId: createdDepositId, action: 'UPDATED' },
      });
      expect(updateAudit).not.toBeNull();
      expect(updateAudit?.principalAmount).toBe(100000);
    });

    it('should strictly return 404 when User B attempts to access or modify User A deposit', async () => {
      const getReq = new NextRequest(`http://localhost:3000/api/deposits/${createdDepositId}`, {
        method: 'GET',
        headers: { Cookie: userBCookie },
      });
      const getRes = await getDepositHandler(getReq, { params: { id: createdDepositId } });
      expect(getRes.status).toBe(404);

      const putReq = new NextRequest(`http://localhost:3000/api/deposits/${createdDepositId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: userBCookie },
        body: JSON.stringify({ annualRate: 15.0 }),
      });
      const putRes = await updateDepositHandler(putReq, { params: { id: createdDepositId } });
      expect(putRes.status).toBe(404);
    });

    it('should reject closing without mandatory disposition metadata with 400', async () => {
      const req = new NextRequest(`http://localhost:3000/api/deposits/${createdDepositId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({}),
      });

      const res = await closeDepositHandler(req, { params: { id: createdDepositId } });
      expect(res.status).toBe(400);
    });

    it('should successfully close deposit with MATURED_REINVESTED disposition and record audit details', async () => {
      const req = new NextRequest(`http://localhost:3000/api/deposits/${createdDepositId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          dispositionType: 'MATURED_REINVESTED',
          destinationAccount: 'SCB-CHECKING-99',
          realizedInterest: 8243.22,
          penaltyAmount: 0.0,
          notes: 'Rolled over into 3-year term deposit',
        }),
      });

      const res = await closeDepositHandler(req, { params: { id: createdDepositId } });
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.status).toBe('CLOSED');
      expect(data.netProceeds).toBeCloseTo(108243.22, 0.05);

      // Verify CLOSED audit log
      const closeAudit = await prisma.auditLog.findFirst({
        where: { depositId: createdDepositId, action: 'CLOSED' },
      });
      expect(closeAudit).not.toBeNull();
      expect(closeAudit?.dispositionType).toBe('MATURED_REINVESTED');
      expect(closeAudit?.destinationAccount).toBe('SCB-CHECKING-99');
    });

    it('should reject further modifications once closed', async () => {
      const req = new NextRequest(`http://localhost:3000/api/deposits/${createdDepositId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({ annualRate: 10.0 }),
      });

      const res = await updateDepositHandler(req, { params: { id: createdDepositId } });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/closed or liquidated/i);
    });

    it('should delete a deposit, record DELETED audit log, and return 200', async () => {
      const req = new NextRequest(`http://localhost:3000/api/deposits/${createdDepositId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
      });

      const res = await deleteDepositHandler(req, { params: { id: createdDepositId } });
      expect(res.status).toBe(200);

      // Verify deposit deleted from table
      const inDb = await prisma.fixedDeposit.findUnique({
        where: { id: createdDepositId },
      });
      expect(inDb).toBeNull();

      // Verify DELETED audit log exists
      const deleteAudit = await prisma.auditLog.findFirst({
        where: { action: 'DELETED', bankName: 'Standard Chartered' },
      });
      expect(deleteAudit).not.toBeNull();
    });
  });
});

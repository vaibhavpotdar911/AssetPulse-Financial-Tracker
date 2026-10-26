import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma, checkDatabaseConnection } from '@/lib/db';
import { POST as createDepositHandler, GET as listDepositsHandler } from '@/app/api/deposits/route';
import { POST as closeDepositHandler } from '@/app/api/deposits/[id]/close/route';
import { POST as rollbackDepositHandler } from '@/app/api/deposits/[id]/rollback/route';
import { POST as renewDepositHandler } from '@/app/api/deposits/[id]/renew/route';
import { GET as getAuditLogsHandler } from '@/app/api/audit-logs/route';
import { createSessionToken } from '@/lib/auth';

describe('Integration Test: Fixed Deposit Closure Rollback & Reopen Subsystem', () => {
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
        email: `rollback_alice_${timestamp}@assetpulse.dev`,
        password: 'HashedPassword123!',
        name: 'Alice Rollback',
      },
    });
    userAId = userA.id;
    const tokenA = await createSessionToken({ id: userA.id, email: userA.email, name: userA.name });
    userACookie = `assetpulse_session=${tokenA}`;

    const userB = await prisma.user.create({
      data: {
        email: `rollback_bob_${timestamp}@assetpulse.dev`,
        password: 'HashedPassword123!',
        name: 'Bob Rollback',
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

  describe('Rollback Functionality (POST /api/deposits/[id]/rollback)', () => {
    let closedDepositId: string;
    let liquidatedDepositId: string;

    it('should set up a closed deposit and a liquidated deposit for Alice', async () => {
      // 1. Create deposit 1 (future maturity)
      const dep1 = await prisma.fixedDeposit.create({
        data: {
          userId: userAId,
          bankName: 'HDFC Bank',
          accountNumber: `HDFC-RB-${timestamp}-1`,
          principalAmount: 100000,
          annualRate: 7.5,
          compoundingFrequency: 'QUARTERLY',
          startDate: new Date('2025-01-01'),
          maturityDate: new Date('2027-01-01'), // Future date
          maturityAmount: 115969,
          totalInterestEarned: 15969,
          status: 'ACTIVE',
        },
      });

      // Close it
      const closeReq1 = new NextRequest(`http://localhost:3000/api/deposits/${dep1.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          dispositionType: 'TRANSFERRED_SAVINGS',
          destinationAccount: 'HDFC Savings 1234',
        }),
      });
      const closeRes1 = await closeDepositHandler(closeReq1, { params: Promise.resolve({ id: dep1.id }) });
      expect(closeRes1.status).toBe(200);
      const closeData1 = await closeRes1.json();
      expect(closeData1.status).toBe('CLOSED');
      closedDepositId = dep1.id;

      // 2. Create deposit 2 (past maturity) and liquidate it
      const dep2 = await prisma.fixedDeposit.create({
        data: {
          userId: userAId,
          bankName: 'Kamal Nagari Sahakari Patasanstha Ltd',
          accountNumber: `KAMAL-RB-${timestamp}-2`,
          principalAmount: 50000,
          annualRate: 9.0,
          compoundingFrequency: 'AT_MATURITY',
          startDate: new Date('2024-01-01'),
          maturityDate: new Date('2025-01-01'), // Past date
          maturityAmount: 54500,
          totalInterestEarned: 4500,
          status: 'ACTIVE',
        },
      });

      // Liquidate it prematurely
      const closeReq2 = new NextRequest(`http://localhost:3000/api/deposits/${dep2.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          dispositionType: 'PREMATURE_WITHDRAWAL',
          destinationAccount: 'SBI Savings 9999',
          penaltyAmount: 500,
        }),
      });
      const closeRes2 = await closeDepositHandler(closeReq2, { params: Promise.resolve({ id: dep2.id }) });
      expect(closeRes2.status).toBe(200);
      const closeData2 = await closeRes2.json();
      expect(closeData2.status).toBe('LIQUIDATED');
      liquidatedDepositId = dep2.id;
    });

    it('should reject rollback from unauthenticated user (401)', async () => {
      const req = new NextRequest(`http://localhost:3000/api/deposits/${closedDepositId}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await rollbackDepositHandler(req, { params: Promise.resolve({ id: closedDepositId }) });
      expect(res.status).toBe(401);
    });

    it('should reject rollback from unauthorized tenant Bob on Alice deposit (404 IDOR)', async () => {
      const req = new NextRequest(`http://localhost:3000/api/deposits/${closedDepositId}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userBCookie },
        body: JSON.stringify({ reason: 'Bob attempting rollback' }),
      });
      const res = await rollbackDepositHandler(req, { params: Promise.resolve({ id: closedDepositId }) });
      expect(res.status).toBe(404);
    });

    it('should rollback closedDeposit1 to ACTIVE via AUTO mode when maturity is in the future', async () => {
      const req = new NextRequest(`http://localhost:3000/api/deposits/${closedDepositId}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          targetStatus: 'AUTO',
          reason: 'Closed by mistake - renewed and still active',
        }),
      });
      const res = await rollbackDepositHandler(req, { params: Promise.resolve({ id: closedDepositId }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.status).toBe('ACTIVE');

      // Verify DB record
      const dbDep = await prisma.fixedDeposit.findUnique({ where: { id: closedDepositId } });
      expect(dbDep?.status).toBe('ACTIVE');

      // Verify audit log entry
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          depositId: closedDepositId,
          action: 'ROLLED_BACK',
        },
      });
      expect(auditLog).toBeDefined();
      expect(auditLog?.notes).toContain('Closed by mistake');
      expect(auditLog?.dispositionType).toBe('CORRECTION');
    });

    it('should reject rollback if the deposit is already ACTIVE (400)', async () => {
      const req = new NextRequest(`http://localhost:3000/api/deposits/${closedDepositId}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({ reason: 'Trying to rollback active deposit' }),
      });
      const res = await rollbackDepositHandler(req, { params: Promise.resolve({ id: closedDepositId }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Only closed or liquidated');
    });

    it('should rollback liquidatedDeposit2 to MATURED via AUTO mode when maturity is in the past', async () => {
      const req = new NextRequest(`http://localhost:3000/api/deposits/${liquidatedDepositId}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          targetStatus: 'AUTO',
          reason: 'Accidental early liquidation rollback',
        }),
      });
      const res = await rollbackDepositHandler(req, { params: Promise.resolve({ id: liquidatedDepositId }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.status).toBe('MATURED');

      const dbDep = await prisma.fixedDeposit.findUnique({ where: { id: liquidatedDepositId } });
      expect(dbDep?.status).toBe('MATURED');
    });

    it('should support explicit targetStatus override (e.g. MATURED on closedDeposit1)', async () => {
      // First close closedDeposit1 again
      await prisma.fixedDeposit.update({
        where: { id: closedDepositId },
        data: { status: 'CLOSED' },
      });

      // Rollback with explicit targetStatus = 'MATURED'
      const req = new NextRequest(`http://localhost:3000/api/deposits/${closedDepositId}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          targetStatus: 'MATURED',
          reason: 'Manual override to matured',
        }),
      });
      const res = await rollbackDepositHandler(req, { params: Promise.resolve({ id: closedDepositId }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('MATURED');
    });

    it('should show ROLLED_BACK logs when querying audit logs with action=ROLLED_BACK', async () => {
      const req = new NextRequest('http://localhost:3000/api/audit-logs?action=ROLLED_BACK', {
        method: 'GET',
        headers: { Cookie: userACookie },
      });
      const res = await getAuditLogsHandler(req);
      expect(res.status).toBe(200);
      const logs = await res.json();
      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.every((l: any) => l.action === 'ROLLED_BACK')).toBe(true);
    });

    it('should allow renewing a rolled-back deposit with the same account number', async () => {
      const renewReq = new NextRequest(`http://localhost:3000/api/deposits/${closedDepositId}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userACookie },
        body: JSON.stringify({
          principal: 105000,
          annualRate: 8.0,
          compoundingFrequency: 'QUARTERLY',
          startDate: '2026-01-01',
          maturityDate: '2028-01-01',
          notes: 'Renewed after rollback correction',
        }),
      });
      const renewRes = await renewDepositHandler(renewReq, { params: Promise.resolve({ id: closedDepositId }) });
      expect(renewRes.status).toBe(201);
      const renewData = await renewRes.json();
      expect(renewData.success).toBe(true);
      expect(renewData.renewedDeposit.accountNumber).toBe(`HDFC-RB-${timestamp}-1`);
      expect(renewData.renewedDeposit.status).toBe('ACTIVE');

      // Previous deposit should now be marked CLOSED
      const priorDep = await prisma.fixedDeposit.findUnique({ where: { id: closedDepositId } });
      expect(priorDep?.status).toBe('CLOSED');
    });
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma, checkDatabaseConnection } from '@/lib/db';
import {
  GET as getAuditLogsHandler,
  POST as postAuditLogsHandler,
  PUT as putAuditLogsHandler,
  PATCH as patchAuditLogsHandler,
  DELETE as deleteAuditLogsHandler,
} from '@/app/api/audit-logs/route';
import {
  GET as getSingleAuditHandler,
  PUT as putSingleAuditHandler,
  DELETE as deleteSingleAuditHandler,
  PATCH as patchSingleAuditHandler,
  POST as postSingleAuditHandler,
} from '@/app/api/audit-logs/[id]/route';
import {
  POST as createDepositHandler,
  GET as getDepositsHandler,
} from '@/app/api/deposits/route';
import {
  GET as getDepositHandler,
  PUT as updateDepositHandler,
  DELETE as deleteDepositHandler,
} from '@/app/api/deposits/[id]/route';
import { POST as closeDepositHandler } from '@/app/api/deposits/[id]/close/route';
import { createSessionToken } from '@/lib/auth';

describe('Adversarial Empirical Challenge: Immutable Audit Ledger & Tenancy', () => {
  const runId = Date.now();
  let userXId: string;
  let userYId: string;
  let userXCookie: string;
  let userYCookie: string;

  let deposit1Id: string;
  let deposit2Id: string;
  let deposit3Id: string;

  let deposit1CreatedLogId: string;
  let deposit1UpdatedLogId: string;
  let deposit1ClosedLogId: string;
  let deposit2LiquidatedLogId: string;
  let deposit3DeletedLogId: string;

  beforeAll(async () => {
    const health = await checkDatabaseConnection();
    expect(health.connected).toBe(true);

    // Setup Tenant X
    const userX = await prisma.user.create({
      data: {
        email: `challenger_user_x_${runId}@assetpulse.dev`,
        password: 'SecurePassword123!',
        name: 'Challenger Tenant X',
      },
    });
    userXId = userX.id;
    const tokenX = await createSessionToken({ id: userX.id, email: userX.email, name: userX.name });
    userXCookie = `assetpulse_session=${tokenX}`;

    // Setup Tenant Y
    const userY = await prisma.user.create({
      data: {
        email: `challenger_user_y_${runId}@assetpulse.dev`,
        password: 'SecurePassword123!',
        name: 'Challenger Tenant Y',
      },
    });
    userYId = userY.id;
    const tokenY = await createSessionToken({ id: userY.id, email: userY.email, name: userY.name });
    userYCookie = `assetpulse_session=${tokenY}`;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { userId: { in: [userXId, userYId] } } });
    await prisma.fixedDeposit.deleteMany({ where: { userId: { in: [userXId, userYId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userXId, userYId] } } });
  });

  // ==========================================================================
  // CHALLENGE 1: Direct Mutation Guards (405 Method Not Allowed & Allow: GET)
  // ==========================================================================
  describe('1. Immutability & 405 Method Not Allowed Guards', () => {
    it('should reject direct POST to /api/audit-logs with 405 and Allow: GET', async () => {
      const res = await postAuditLogsHandler();
      expect(res.status).toBe(405);
      expect(res.headers.get('Allow')).toBe('GET');
      const body = await res.json();
      expect(body.error).toBe('Method Not Allowed');
      expect(body.message).toMatch(/immutable/i);
    });

    it('should reject direct PUT to /api/audit-logs with 405 and Allow: GET', async () => {
      const res = await putAuditLogsHandler();
      expect(res.status).toBe(405);
      expect(res.headers.get('Allow')).toBe('GET');
      const body = await res.json();
      expect(body.error).toBe('Method Not Allowed');
    });

    it('should reject direct PATCH to /api/audit-logs with 405 and Allow: GET', async () => {
      const res = await patchAuditLogsHandler();
      expect(res.status).toBe(405);
      expect(res.headers.get('Allow')).toBe('GET');
      const body = await res.json();
      expect(body.error).toBe('Method Not Allowed');
    });

    it('should reject direct DELETE to /api/audit-logs with 405 and Allow: GET', async () => {
      const res = await deleteAuditLogsHandler();
      expect(res.status).toBe(405);
      expect(res.headers.get('Allow')).toBe('GET');
      const body = await res.json();
      expect(body.error).toBe('Method Not Allowed');
    });

    it('should reject direct PUT to /api/audit-logs/[id] with 405 and Allow: GET', async () => {
      const res = await putSingleAuditHandler();
      expect(res.status).toBe(405);
      expect(res.headers.get('Allow')).toBe('GET');
      const body = await res.json();
      expect(body.error).toBe('Method Not Allowed');
    });

    it('should reject direct PATCH to /api/audit-logs/[id] with 405 and Allow: GET', async () => {
      const res = await patchSingleAuditHandler();
      expect(res.status).toBe(405);
      expect(res.headers.get('Allow')).toBe('GET');
      const body = await res.json();
      expect(body.error).toBe('Method Not Allowed');
    });

    it('should reject direct DELETE to /api/audit-logs/[id] with 405 and Allow: GET', async () => {
      const res = await deleteSingleAuditHandler();
      expect(res.status).toBe(405);
      expect(res.headers.get('Allow')).toBe('GET');
      const body = await res.json();
      expect(body.error).toBe('Method Not Allowed');
    });

    it('should reject direct POST to /api/audit-logs/[id] with 405 and Allow: GET', async () => {
      const res = await postSingleAuditHandler();
      expect(res.status).toBe(405);
      expect(res.headers.get('Allow')).toBe('GET');
      const body = await res.json();
      expect(body.error).toBe('Method Not Allowed');
    });
  });

  // ==========================================================================
  // CHALLENGE 2: Audit Record Creation & Snapshot Integrity
  // ==========================================================================
  describe('2. Audit Record Creation & Snapshot Integrity Across FD Lifecycle', () => {
    it('Step 2.1: Deposit creation should record a CREATED audit log with valid snapshot', async () => {
      const createReq = new NextRequest('http://localhost:3000/api/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userXCookie },
        body: JSON.stringify({
          bankName: 'Bank of America',
          accountNumber: 'BOA-ACC-101',
          principal: 50000,
          annualRate: 6.5,
          compoundingFrequency: 'MONTHLY',
          startDate: '2026-01-01',
          maturityDate: '2027-01-01',
          notes: 'Initial test deposit for Tenant X',
        }),
      });

      const createRes = await createDepositHandler(createReq);
      expect(createRes.status).toBe(201);
      const createdData = await createRes.json();
      deposit1Id = createdData.id;
      expect(deposit1Id).toBeDefined();

      // Retrieve audit log created for this deposit
      const audit = await prisma.auditLog.findFirst({
        where: { depositId: deposit1Id, action: 'CREATED', userId: userXId },
      });
      expect(audit).not.toBeNull();
      deposit1CreatedLogId = audit!.id;

      expect(audit!.bankName).toBe('Bank of America');
      expect(audit!.accountNumber).toBe('BOA-ACC-101');
      expect(audit!.principalAmount).toBe(50000);
      expect(audit!.action).toBe('CREATED');

      // Verify Snapshot integrity
      expect(typeof audit!.snapshotData).toBe('string');
      const snapshot = JSON.parse(audit!.snapshotData);
      expect(snapshot).toBeDefined();
      expect(snapshot.action).toBe('CREATED');
      expect(snapshot.newState).toBeDefined();
      expect(snapshot.newState.bankName).toBe('Bank of America');
      expect(snapshot.newState.principalAmount).toBe(50000);
      expect(snapshot.newState.annualRate).toBe(6.5);
      expect(snapshot.newState.compoundingFrequency).toBe('MONTHLY');
    });

    it('Step 2.2: Deposit update should record an UPDATED audit log capturing previousState and newState', async () => {
      const updateReq = new NextRequest(`http://localhost:3000/api/deposits/${deposit1Id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: userXCookie },
        body: JSON.stringify({
          bankName: 'Bank of America Premier',
          accountNumber: 'BOA-ACC-101-UPD',
          principal: 55000,
          annualRate: 7.0,
          compoundingFrequency: 'QUARTERLY',
          notes: 'Upgraded to premier account',
        }),
      });

      const updateRes = await updateDepositHandler(updateReq, { params: { id: deposit1Id } });
      expect(updateRes.status).toBe(200);
      const updatedData = await updateRes.json();
      expect(updatedData.bankName).toBe('Bank of America Premier');
      expect(updatedData.principalAmount).toBe(55000);

      // Retrieve UPDATED audit log
      const updateAudit = await prisma.auditLog.findFirst({
        where: { depositId: deposit1Id, action: 'UPDATED', userId: userXId },
      });
      expect(updateAudit).not.toBeNull();
      deposit1UpdatedLogId = updateAudit!.id;

      expect(updateAudit!.bankName).toBe('Bank of America Premier');
      expect(updateAudit!.principalAmount).toBe(55000);

      // Verify Snapshot captures both previousState and newState
      const snapshot = JSON.parse(updateAudit!.snapshotData);
      expect(snapshot.action).toBe('UPDATED');
      expect(snapshot.previousState).toBeDefined();
      expect(snapshot.newState).toBeDefined();

      // Check diff fidelity
      expect(snapshot.previousState.bankName).toBe('Bank of America');
      expect(snapshot.previousState.principalAmount).toBe(50000);
      expect(snapshot.previousState.annualRate).toBe(6.5);

      expect(snapshot.newState.bankName).toBe('Bank of America Premier');
      expect(snapshot.newState.principalAmount).toBe(55000);
      expect(snapshot.newState.annualRate).toBe(7.0);
    });

    it('Step 2.3: Deposit closure should record a CLOSED audit log with disposition details', async () => {
      const closeReq = new NextRequest(`http://localhost:3000/api/deposits/${deposit1Id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userXCookie },
        body: JSON.stringify({
          dispositionType: 'MATURED_REINVESTED',
          destinationAccount: 'BOA-SAVINGS-777',
          realizedInterest: 3950.50,
          penaltyAmount: 0,
          notes: 'Term ended, transferred to savings',
        }),
      });

      const closeRes = await closeDepositHandler(closeReq, { params: { id: deposit1Id } });
      expect(closeRes.status).toBe(200);
      const closeData = await closeRes.json();
      expect(closeData.status).toBe('CLOSED');
      expect(closeData.netProceeds).toBeCloseTo(55000 + 3950.50, 0.01);

      // Retrieve CLOSED audit log
      const closeAudit = await prisma.auditLog.findFirst({
        where: { depositId: deposit1Id, action: 'CLOSED', userId: userXId },
      });
      expect(closeAudit).not.toBeNull();
      deposit1ClosedLogId = closeAudit!.id;

      expect(closeAudit!.dispositionType).toBe('MATURED_REINVESTED');
      expect(closeAudit!.destinationAccount).toBe('BOA-SAVINGS-777');
      expect(closeAudit!.realizedInterest).toBe(3950.50);
      expect(closeAudit!.penaltyAmount).toBe(0);

      // Verify snapshot disposition integrity
      const snapshot = JSON.parse(closeAudit!.snapshotData);
      expect(snapshot.action).toBe('CLOSED');
      expect(snapshot.dispositionType).toBe('MATURED_REINVESTED');
      expect(snapshot.destinationAccount).toBe('BOA-SAVINGS-777');
      expect(snapshot.realizedInterest).toBe(3950.50);
      expect(snapshot.penaltyAmount).toBe(0);
      expect(snapshot.netProceeds).toBeCloseTo(58950.50, 0.01);
    });

    it('Step 2.4: Premature closure should record a LIQUIDATED audit log with penalty disposition', async () => {
      // Create Deposit 2
      const createReq = new NextRequest('http://localhost:3000/api/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userXCookie },
        body: JSON.stringify({
          bankName: 'Wells Fargo',
          accountNumber: 'WF-ACC-202',
          principal: 75000,
          annualRate: 5.5,
          compoundingFrequency: 'ANNUALLY',
          startDate: '2026-01-01',
          maturityDate: '2028-01-01',
        }),
      });
      const createRes = await createDepositHandler(createReq);
      expect(createRes.status).toBe(201);
      const data2 = await createRes.json();
      deposit2Id = data2.id;

      // Prematurely liquidate Deposit 2
      const liquidateReq = new NextRequest(`http://localhost:3000/api/deposits/${deposit2Id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userXCookie },
        body: JSON.stringify({
          dispositionType: 'PREMATURE_WITHDRAWAL',
          destinationAccount: 'WF-CHECKING-555',
          realizedInterest: 2000,
          penaltyAmount: 500,
          notes: 'Emergency premature liquidation',
        }),
      });

      const liquidateRes = await closeDepositHandler(liquidateReq, { params: { id: deposit2Id } });
      expect(liquidateRes.status).toBe(200);
      const liquidateData = await liquidateRes.json();
      expect(liquidateData.status).toBe('LIQUIDATED');
      expect(liquidateData.netProceeds).toBe(75000 + 2000 - 500);

      // Verify LIQUIDATED audit log
      const liquidateAudit = await prisma.auditLog.findFirst({
        where: { depositId: deposit2Id, action: 'LIQUIDATED', userId: userXId },
      });
      expect(liquidateAudit).not.toBeNull();
      deposit2LiquidatedLogId = liquidateAudit!.id;

      expect(liquidateAudit!.action).toBe('LIQUIDATED');
      expect(liquidateAudit!.dispositionType).toBe('PREMATURE_WITHDRAWAL');
      expect(liquidateAudit!.penaltyAmount).toBe(500);
      expect(liquidateAudit!.realizedInterest).toBe(2000);

      const snapshot = JSON.parse(liquidateAudit!.snapshotData);
      expect(snapshot.action).toBe('LIQUIDATED');
      expect(snapshot.penaltyAmount).toBe(500);
      expect(snapshot.netProceeds).toBe(76500);
    });

    it('Step 2.5: Deposit deletion should record a DELETED audit log and retain it in database', async () => {
      // Create Deposit 3
      const createReq = new NextRequest('http://localhost:3000/api/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userXCookie },
        body: JSON.stringify({
          bankName: 'Citibank N.A.',
          accountNumber: 'CITI-ACC-303',
          principal: 30000,
          annualRate: 4.8,
          compoundingFrequency: 'MONTHLY',
          startDate: '2026-01-01',
          maturityDate: '2026-12-31',
        }),
      });
      const createRes = await createDepositHandler(createReq);
      expect(createRes.status).toBe(201);
      const data3 = await createRes.json();
      deposit3Id = data3.id;

      // Delete Deposit 3
      const deleteReq = new NextRequest(`http://localhost:3000/api/deposits/${deposit3Id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Cookie: userXCookie },
        body: JSON.stringify({
          dispositionType: 'OTHER',
          destinationAccount: 'EXTERNAL-TRANSFER',
          notes: 'Closing account and moving to broker',
        }),
      });

      const deleteRes = await deleteDepositHandler(deleteReq, { params: { id: deposit3Id } });
      expect(deleteRes.status).toBe(200);

      // Assert deposit record is removed from fixed_deposits
      const deletedInDb = await prisma.fixedDeposit.findUnique({
        where: { id: deposit3Id },
      });
      expect(deletedInDb).toBeNull();

      // Assert DELETED audit log exists and was NOT deleted
      const deleteAudit = await prisma.auditLog.findFirst({
        where: { action: 'DELETED', bankName: 'Citibank N.A.', userId: userXId },
      });
      expect(deleteAudit).not.toBeNull();
      deposit3DeletedLogId = deleteAudit!.id;

      expect(deleteAudit!.action).toBe('DELETED');
      expect(deleteAudit!.principalAmount).toBe(30000);
      expect(deleteAudit!.dispositionType).toBe('OTHER');
      expect(deleteAudit!.destinationAccount).toBe('EXTERNAL-TRANSFER');

      const snapshot = JSON.parse(deleteAudit!.snapshotData);
      expect(snapshot.action).toBe('DELETED');
      expect(snapshot.previousState).toBeDefined();
      expect(snapshot.previousState.accountNumber).toBe('CITI-ACC-303');
    });
  });

  // ==========================================================================
  // CHALLENGE 3: Audit Log Queries, Filtering & Pagination Headers
  // ==========================================================================
  describe('3. Audit Log Queries, Filtering & Pagination Headers', () => {
    it('should query all audit logs for user with default array response and pagination headers', async () => {
      const req = new NextRequest('http://localhost:3000/api/audit-logs', {
        method: 'GET',
        headers: { Cookie: userXCookie },
      });

      const res = await getAuditLogsHandler(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/json');
      expect(res.headers.get('Cache-Control')).toMatch(/no-store/);

      // Tenant X has: CREATED(dep1), UPDATED(dep1), CLOSED(dep1), CREATED(dep2), LIQUIDATED(dep2), CREATED(dep3), DELETED(dep3) -> total 7
      const totalCountHeader = res.headers.get('X-Total-Count');
      expect(Number(totalCountHeader)).toBeGreaterThanOrEqual(7);
      expect(res.headers.get('X-Page')).toBe('1');
      expect(res.headers.get('X-Limit')).toBe('50');

      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(7);
    });

    it('should filter audit logs by action (CLOSED and LIQUIDATED)', async () => {
      // Filter CLOSED
      const reqClosed = new NextRequest('http://localhost:3000/api/audit-logs?action=CLOSED', {
        method: 'GET',
        headers: { Cookie: userXCookie },
      });
      const resClosed = await getAuditLogsHandler(reqClosed);
      expect(resClosed.status).toBe(200);
      const dataClosed = await resClosed.json();
      expect(dataClosed.length).toBeGreaterThanOrEqual(1);
      expect(dataClosed.every((l: any) => l.action === 'CLOSED')).toBe(true);

      // Filter LIQUIDATED
      const reqLiq = new NextRequest('http://localhost:3000/api/audit-logs?action=LIQUIDATED', {
        method: 'GET',
        headers: { Cookie: userXCookie },
      });
      const resLiq = await getAuditLogsHandler(reqLiq);
      expect(resLiq.status).toBe(200);
      const dataLiq = await resLiq.json();
      expect(dataLiq.length).toBeGreaterThanOrEqual(1);
      expect(dataLiq.every((l: any) => l.action === 'LIQUIDATED')).toBe(true);
    });

    it('should filter audit logs by case-insensitive bankName substring', async () => {
      const req = new NextRequest('http://localhost:3000/api/audit-logs?bankName=wells', {
        method: 'GET',
        headers: { Cookie: userXCookie },
      });
      const res = await getAuditLogsHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.length).toBeGreaterThanOrEqual(2); // CREATED + LIQUIDATED for Wells Fargo
      expect(data.every((l: any) => l.bankName.toLowerCase().includes('wells'))).toBe(true);
    });

    it('should filter audit logs by date range (startDate & endDate)', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const req = new NextRequest(`http://localhost:3000/api/audit-logs?startDate=${today}&endDate=${today}`, {
        method: 'GET',
        headers: { Cookie: userXCookie },
      });
      const res = await getAuditLogsHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.length).toBeGreaterThanOrEqual(7);

      // Out of range in future
      const reqFuture = new NextRequest('http://localhost:3000/api/audit-logs?startDate=2099-01-01', {
        method: 'GET',
        headers: { Cookie: userXCookie },
      });
      const resFuture = await getAuditLogsHandler(reqFuture);
      expect(resFuture.status).toBe(200);
      const dataFuture = await resFuture.json();
      expect(dataFuture.length).toBe(0);
      expect(resFuture.headers.get('X-Total-Count')).toBe('0');
    });

    it('should support pagination with page and limit parameters', async () => {
      const reqPage1 = new NextRequest('http://localhost:3000/api/audit-logs?page=1&limit=2', {
        method: 'GET',
        headers: { Cookie: userXCookie },
      });
      const resPage1 = await getAuditLogsHandler(reqPage1);
      expect(resPage1.status).toBe(200);
      const dataPage1 = await resPage1.json();
      expect(dataPage1.length).toBe(2);
      expect(resPage1.headers.get('X-Page')).toBe('1');
      expect(resPage1.headers.get('X-Limit')).toBe('2');

      const reqPage2 = new NextRequest('http://localhost:3000/api/audit-logs?page=2&limit=2', {
        method: 'GET',
        headers: { Cookie: userXCookie },
      });
      const resPage2 = await getAuditLogsHandler(reqPage2);
      expect(resPage2.status).toBe(200);
      const dataPage2 = await resPage2.json();
      expect(dataPage2.length).toBe(2);
      expect(resPage2.headers.get('X-Page')).toBe('2');

      // Verify page 1 and page 2 do not overlap
      const p1Ids = new Set(dataPage1.map((d: any) => d.id));
      const overlap = dataPage2.filter((d: any) => p1Ids.has(d.id));
      expect(overlap.length).toBe(0);
    });

    it('should support enveloped response format via ?envelope=true', async () => {
      const req = new NextRequest('http://localhost:3000/api/audit-logs?envelope=true&limit=3', {
        method: 'GET',
        headers: { Cookie: userXCookie },
      });
      const res = await getAuditLogsHandler(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(3);
      expect(body.pagination).toBeDefined();
      expect(body.pagination.limit).toBe(3);
      expect(body.pagination.total).toBeGreaterThanOrEqual(7);
    });

    it('should fetch single audit log detail and parse snapshot object', async () => {
      const req = new NextRequest(`http://localhost:3000/api/audit-logs/${deposit1ClosedLogId}`, {
        method: 'GET',
        headers: { Cookie: userXCookie },
      });
      const res = await getSingleAuditHandler(req, { params: { id: deposit1ClosedLogId } });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(deposit1ClosedLogId);
      expect(body.data.snapshot).toBeDefined();
      expect(body.data.snapshot.action).toBe('CLOSED');
      expect(body.data.snapshot.dispositionType).toBe('MATURED_REINVESTED');
    });

    it('should support Next.js 15 async promise params for single audit log handler', async () => {
      const req = new NextRequest(`http://localhost:3000/api/audit-logs/${deposit1ClosedLogId}`, {
        method: 'GET',
        headers: { Cookie: userXCookie },
      });
      const res = await getSingleAuditHandler(req, {
        params: Promise.resolve({ id: deposit1ClosedLogId }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(deposit1ClosedLogId);
    });
  });

  // ==========================================================================
  // CHALLENGE 4: Multi-Tenant Isolation & Authentication Guards
  // ==========================================================================
  describe('4. Multi-Tenant Isolation & Unauthorized Guards', () => {
    it('Tenant Y querying /api/audit-logs should return zero records from Tenant X', async () => {
      const req = new NextRequest('http://localhost:3000/api/audit-logs', {
        method: 'GET',
        headers: { Cookie: userYCookie },
      });
      const res = await getAuditLogsHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.length).toBe(0);
      expect(res.headers.get('X-Total-Count')).toBe('0');
    });

    it('Tenant Y querying Tenant X audit log by ID should return 404 Not Found', async () => {
      const req = new NextRequest(`http://localhost:3000/api/audit-logs/${deposit1CreatedLogId}`, {
        method: 'GET',
        headers: { Cookie: userYCookie },
      });
      const res = await getSingleAuditHandler(req, { params: { id: deposit1CreatedLogId } });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('Not Found');
    });

    it('Tenant Y querying with Tenant X bank name should return zero records', async () => {
      const req = new NextRequest('http://localhost:3000/api/audit-logs?bankName=America', {
        method: 'GET',
        headers: { Cookie: userYCookie },
      });
      const res = await getAuditLogsHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.length).toBe(0);
    });

    it('Unauthenticated GET to /api/audit-logs should return 401 Unauthorized', async () => {
      const req = new NextRequest('http://localhost:3000/api/audit-logs', {
        method: 'GET',
      });
      const res = await getAuditLogsHandler(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Unauthorized');
    });

    it('Unauthenticated GET to /api/audit-logs/[id] should return 401 Unauthorized', async () => {
      const req = new NextRequest(`http://localhost:3000/api/audit-logs/${deposit1CreatedLogId}`, {
        method: 'GET',
      });
      const res = await getSingleAuditHandler(req, { params: { id: deposit1CreatedLogId } });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Unauthorized');
    });

    it('Request with non-existent audit log ID should return 404 Not Found', async () => {
      const nonExistentId = 'non-existent-audit-log-uuid-999';
      const req = new NextRequest(`http://localhost:3000/api/audit-logs/${nonExistentId}`, {
        method: 'GET',
        headers: { Cookie: userXCookie },
      });
      const res = await getSingleAuditHandler(req, { params: { id: nonExistentId } });
      expect(res.status).toBe(404);
    });
  });
});

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
import { recordAuditLog } from '@/lib/audit';
import { createSessionToken } from '@/lib/auth';

describe('Integration Test: Audit Log Ledger & Immutability Guarantees', () => {
  const timestamp = Date.now();
  let userAId: string;
  let userBId: string;
  let userACookie: string;
  let userBCookie: string;
  let sampleLogId: string;

  beforeAll(async () => {
    const health = await checkDatabaseConnection();
    expect(health.connected).toBe(true);

    const userA = await prisma.user.create({
      data: {
        email: `audit_user_a_${timestamp}@assetpulse.dev`,
        password: 'Password123!',
        name: 'Audit Inspector A',
      },
    });
    userAId = userA.id;
    const tokenA = await createSessionToken({ id: userA.id, email: userA.email, name: userA.name });
    userACookie = `assetpulse_session=${tokenA}`;

    const userB = await prisma.user.create({
      data: {
        email: `audit_user_b_${timestamp}@assetpulse.dev`,
        password: 'Password123!',
        name: 'Audit Inspector B',
      },
    });
    userBId = userB.id;
    const tokenB = await createSessionToken({ id: userB.id, email: userB.email, name: userB.name });
    userBCookie = `assetpulse_session=${tokenB}`;

    // Seed historical audit records for User A
    const log1 = await recordAuditLog({
      userId: userAId,
      action: 'CREATED',
      bankName: 'HDFC Bank',
      accountNumber: 'HDFC-001',
      principalAmount: 250000,
      snapshotData: { sample: 'create_hdfc' },
    });
    sampleLogId = log1.id;

    await recordAuditLog({
      userId: userAId,
      action: 'CLOSED',
      bankName: 'HDFC Bank',
      accountNumber: 'HDFC-001',
      principalAmount: 250000,
      realizedInterest: 18125,
      dispositionType: 'TRANSFERRED_SAVINGS',
      destinationAccount: 'HDFC-SAVINGS-12',
      snapshotData: { sample: 'close_hdfc' },
    });

    await recordAuditLog({
      userId: userAId,
      action: 'LIQUIDATED',
      bankName: 'Chase Bank',
      accountNumber: 'CHASE-002',
      principalAmount: 50000,
      realizedInterest: 2100,
      penaltyAmount: 500,
      dispositionType: 'PREMATURE_WITHDRAWAL',
      snapshotData: { sample: 'liquidate_chase' },
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  });

  it('should query audit logs and support filtering by action', async () => {
    const req = new NextRequest('http://localhost:3000/api/audit-logs?action=CLOSED', {
      method: 'GET',
      headers: { Cookie: userACookie },
    });

    const res = await getAuditLogsHandler(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.length).toBeGreaterThan(0);
    expect(data.every((l: any) => l.action === 'CLOSED')).toBe(true);
  });

  it('should support filtering by bank name substring', async () => {
    const req = new NextRequest('http://localhost:3000/api/audit-logs?bankName=hdfc', {
      method: 'GET',
      headers: { Cookie: userACookie },
    });

    const res = await getAuditLogsHandler(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.length).toBe(2);
    expect(data.every((l: any) => l.bankName.toLowerCase().includes('hdfc'))).toBe(true);
  });

  it('should verify snapshotData JSON integrity and valid parsing', async () => {
    const req = new NextRequest('http://localhost:3000/api/audit-logs', {
      method: 'GET',
      headers: { Cookie: userACookie },
    });

    const res = await getAuditLogsHandler(req);
    const data = await res.json();

    expect(data.length).toBe(3);
    for (const log of data) {
      expect(typeof log.snapshotData).toBe('string');
      const parsed = JSON.parse(log.snapshotData);
      expect(parsed).toBeDefined();
    }
  });

  it('should fetch single audit log record with parsed snapshot object', async () => {
    const req = new NextRequest(`http://localhost:3000/api/audit-logs/${sampleLogId}`, {
      method: 'GET',
      headers: { Cookie: userACookie },
    });

    const res = await getSingleAuditHandler(req, { params: { id: sampleLogId } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(sampleLogId);
    expect(body.data.snapshot).toBeDefined();
    expect(body.data.snapshot.sample).toBe('create_hdfc');
  });

  it('should enforce multi-tenant isolation so User B sees 0 records from User A', async () => {
    const req = new NextRequest('http://localhost:3000/api/audit-logs', {
      method: 'GET',
      headers: { Cookie: userBCookie },
    });

    const res = await getAuditLogsHandler(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.length).toBe(0);

    // User B also cannot get single audit log of User A
    const singleReq = new NextRequest(`http://localhost:3000/api/audit-logs/${sampleLogId}`, {
      method: 'GET',
      headers: { Cookie: userBCookie },
    });
    const singleRes = await getSingleAuditHandler(singleReq, { params: { id: sampleLogId } });
    expect(singleRes.status).toBe(404);
  });

  it('should strictly reject POST, PUT, PATCH, DELETE mutations on /api/audit-logs with 405 Method Not Allowed', async () => {
    const postRes = await postAuditLogsHandler();
    expect(postRes.status).toBe(405);
    expect(postRes.headers.get('Allow')).toBe('GET');

    const putRes = await putAuditLogsHandler();
    expect(putRes.status).toBe(405);
    expect(putRes.headers.get('Allow')).toBe('GET');

    const patchRes = await patchAuditLogsHandler();
    expect(patchRes.status).toBe(405);
    expect(patchRes.headers.get('Allow')).toBe('GET');

    const deleteRes = await deleteAuditLogsHandler();
    expect(deleteRes.status).toBe(405);
    expect(deleteRes.headers.get('Allow')).toBe('GET');
  });

  it('should strictly reject mutations on /api/audit-logs/[id] with 405 Method Not Allowed', async () => {
    const putSingleRes = await putSingleAuditHandler();
    expect(putSingleRes.status).toBe(405);
    expect(putSingleRes.headers.get('Allow')).toBe('GET');

    const deleteSingleRes = await deleteSingleAuditHandler();
    expect(deleteSingleRes.status).toBe(405);
    expect(deleteSingleRes.headers.get('Allow')).toBe('GET');

    const patchSingleRes = await patchSingleAuditHandler();
    expect(patchSingleRes.status).toBe(405);
    expect(patchSingleRes.headers.get('Allow')).toBe('GET');

    const postSingleRes = await postSingleAuditHandler();
    expect(postSingleRes.status).toBe(405);
    expect(postSingleRes.headers.get('Allow')).toBe('GET');
  });
});

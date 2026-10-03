import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, stripTenantFields } from '@/lib/session';
import { calculateFixedDeposit, parseDateUTC, CompoundingFrequency } from '@/lib/financial';
import { recordAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const VALID_FREQUENCIES: CompoundingFrequency[] = [
  'MONTHLY',
  'QUARTERLY',
  'SEMI_ANNUALLY',
  'ANNUALLY',
  'AT_MATURITY',
];

async function resolveId(routeParams: any): Promise<string | null> {
  if (!routeParams) return null;
  if (typeof routeParams.id === 'string') return routeParams.id;
  if (routeParams.params) {
    const resolved = await routeParams.params;
    return resolved?.id || null;
  }
  return null;
}

function enrichDeposit(deposit: any) {
  const metrics = calculateFixedDeposit({
    principal: deposit.principalAmount,
    annualRate: deposit.annualRate,
    compoundingFrequency: deposit.compoundingFrequency as CompoundingFrequency,
    startDate: deposit.startDate,
    maturityDate: deposit.maturityDate,
    currentDate: new Date(),
  });

  return {
    ...deposit,
    principal: deposit.principalAmount,
    maturityAmount: metrics.maturityAmount,
    totalInterestEarned: metrics.totalInterestEarned,
    accruedInterest: metrics.accruedInterest,
    daysRemaining: metrics.daysRemaining,
    totalDays: metrics.totalDays,
    elapsedDays: metrics.elapsedDays,
    progressPercentage: metrics.progressPercentage,
    isMatured: metrics.isMatured,
  };
}

/**
 * GET /api/deposits/[id]
 * Scoped by userId: user.id.
 * Returns uniform 404 if not found or belongs to another tenant.
 */
export const GET = withAuth(async (request: NextRequest, { user }, routeParams) => {
  try {
    const id = await resolveId(routeParams);
    if (!id) {
      return NextResponse.json({ error: 'Deposit not found' }, { status: 404 });
    }

    const deposit = await prisma.fixedDeposit.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });

    if (!deposit) {
      return NextResponse.json({ error: 'Deposit not found' }, { status: 404 });
    }

    return NextResponse.json(enrichDeposit(deposit), { status: 200 });
  } catch (error: any) {
    console.error('[API /api/deposits/[id] GET] Internal Error:', error);
    return NextResponse.json({ error: 'Deposit not found' }, { status: 404 });
  }
});

/**
 * PUT /api/deposits/[id]
 * Validates and updates deposit details, recalculates metrics, and triggers UPDATED audit log.
 */
export const PUT = withAuth(async (request: NextRequest, { user }, routeParams) => {
  try {
    const id = await resolveId(routeParams);
    if (!id) {
      return NextResponse.json({ error: 'Deposit not found' }, { status: 404 });
    }

    const existing = await prisma.fixedDeposit.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Deposit not found' }, { status: 404 });
    }

    if (existing.status === 'CLOSED' || existing.status === 'LIQUIDATED') {
      return NextResponse.json(
        { error: 'Cannot update a closed or liquidated deposit.' },
        { status: 400 }
      );
    }

    let rawBody: any;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request payload.' }, { status: 400 });
    }

    const body = stripTenantFields(rawBody);

    const bankName = body.bankName !== undefined ? String(body.bankName).trim() : existing.bankName;
    const accountNumber = body.accountNumber !== undefined ? String(body.accountNumber).trim() : existing.accountNumber;
    const rawPrincipal = body.principal !== undefined ? body.principal : body.principalAmount;
    const principal = rawPrincipal !== undefined ? Number(rawPrincipal) : existing.principalAmount;
    const rawRate = body.annualRate !== undefined ? body.annualRate : body.rate;
    const annualRate = rawRate !== undefined ? Number(rawRate) : existing.annualRate;
    const compoundingFrequency = body.compoundingFrequency !== undefined
      ? (String(body.compoundingFrequency).trim().toUpperCase() as CompoundingFrequency)
      : (existing.compoundingFrequency as CompoundingFrequency);

    let startDate: Date = existing.startDate;
    let maturityDate: Date = existing.maturityDate;

    if (body.startDate !== undefined) {
      try {
        startDate = parseDateUTC(body.startDate);
      } catch {
        return NextResponse.json({ error: 'Invalid start date format.' }, { status: 400 });
      }
    }
    if (body.maturityDate !== undefined) {
      try {
        maturityDate = parseDateUTC(body.maturityDate);
      } catch {
        return NextResponse.json({ error: 'Invalid maturity date format.' }, { status: 400 });
      }
    }

    const isAutoRenew = body.isAutoRenew !== undefined ? Boolean(body.isAutoRenew) : existing.isAutoRenew;
    const notes = body.notes !== undefined ? (body.notes ? String(body.notes).trim() : null) : existing.notes;

    // Validate updated fields
    if (isNaN(principal) || principal <= 0) {
      return NextResponse.json({ error: 'Principal amount must be greater than 0.' }, { status: 400 });
    }
    if (isNaN(annualRate) || annualRate < 0) {
      return NextResponse.json({ error: 'Annual rate cannot be negative.' }, { status: 400 });
    }
    if (!VALID_FREQUENCIES.includes(compoundingFrequency)) {
      return NextResponse.json({ error: 'Invalid compounding frequency.' }, { status: 400 });
    }
    if (isNaN(startDate.getTime()) || isNaN(maturityDate.getTime()) || maturityDate.getTime() <= startDate.getTime()) {
      return NextResponse.json({ error: 'Maturity date must be strictly after start date.' }, { status: 400 });
    }

    // Recalculate financial metrics
    const metrics = calculateFixedDeposit({
      principal,
      annualRate,
      compoundingFrequency,
      startDate,
      maturityDate,
      currentDate: new Date(),
    });

    const updated = await prisma.fixedDeposit.update({
      where: { id: existing.id },
      data: {
        bankName,
        accountNumber,
        principalAmount: principal,
        annualRate,
        compoundingFrequency,
        startDate,
        maturityDate,
        maturityAmount: metrics.maturityAmount,
        totalInterestEarned: metrics.totalInterestEarned,
        isAutoRenew,
        notes,
      },
    });

    // Trigger UPDATED audit log
    await recordAuditLog({
      userId: user.id,
      depositId: updated.id,
      action: 'UPDATED',
      bankName: updated.bankName,
      accountNumber: updated.accountNumber,
      principalAmount: updated.principalAmount,
      realizedInterest: metrics.accruedInterest,
      snapshotData: {
        action: 'UPDATED',
        timestamp: new Date().toISOString(),
        previousState: existing,
        newState: updated,
      },
      notes: body.notes || 'Deposit details updated.',
    });

    return NextResponse.json(enrichDeposit(updated), { status: 200 });
  } catch (error: any) {
    console.error('[API /api/deposits/[id] PUT] Internal Error:', error);
    return NextResponse.json({ error: 'Failed to update deposit.' }, { status: 500 });
  }
});

/**
 * DELETE /api/deposits/[id]
 * Deletes deposit, triggers DELETED audit log with full snapshot.
 */
export const DELETE = withAuth(async (request: NextRequest, { user }, routeParams) => {
  try {
    const id = await resolveId(routeParams);
    if (!id) {
      return NextResponse.json({ error: 'Deposit not found' }, { status: 404 });
    }

    const existing = await prisma.fixedDeposit.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Deposit not found' }, { status: 404 });
    }

    let body: any = null;
    try {
      body = await request.json();
    } catch {
      // Body is optional for standard DELETE
    }

    // Capture DELETED audit log
    await recordAuditLog({
      userId: user.id,
      depositId: existing.id,
      action: 'DELETED',
      bankName: existing.bankName,
      accountNumber: existing.accountNumber,
      principalAmount: existing.principalAmount,
      snapshotData: {
        action: 'DELETED',
        timestamp: new Date().toISOString(),
        previousState: existing,
        disposition: body,
      },
      dispositionType: body?.dispositionType || 'OTHER',
      destinationAccount: body?.destinationAccount || null,
      notes: body?.notes || 'Deposit deleted from portfolio.',
    });

    await prisma.fixedDeposit.delete({
      where: { id: existing.id },
    });

    return NextResponse.json(
      { success: true, message: 'Deposit deleted successfully.' },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[API /api/deposits/[id] DELETE] Internal Error:', error);
    return NextResponse.json({ error: 'Deposit not found' }, { status: 404 });
  }
});

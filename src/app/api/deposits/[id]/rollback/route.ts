import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, stripTenantFields } from '@/lib/session';
import { calculateFixedDeposit, CompoundingFrequency } from '@/lib/financial';
import { recordAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

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
 * POST /api/deposits/[id]/rollback
 * Reopens / rolls back a prematurely or mistakenly closed/liquidated deposit
 * restoring it to 'ACTIVE' or 'MATURED' status so it recalculates in the portfolio
 * and can be renewed or managed normally.
 */
export const POST = withAuth(async (request: NextRequest, { user }, routeParams) => {
  try {
    const id = await resolveId(routeParams);
    if (!id) {
      return NextResponse.json({ error: 'Deposit not found' }, { status: 404 });
    }

    // 1. Strict multi-tenant verification
    const existing = await prisma.fixedDeposit.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Deposit not found' }, { status: 404 });
    }

    // 2. Status verification: Only closed or liquidated deposits can be rolled back
    if (existing.status !== 'CLOSED' && existing.status !== 'LIQUIDATED') {
      return NextResponse.json(
        { error: 'Only closed or liquidated deposits can be rolled back to active or matured.' },
        { status: 400 }
      );
    }

    // 3. Parse optional body
    let rawBody: any = {};
    try {
      rawBody = await request.json();
    } catch {
      // Body is optional
    }

    const body = stripTenantFields(rawBody || {});
    const customReason = body.reason || body.notes;
    const requestedStatus = (body.targetStatus ? String(body.targetStatus).trim().toUpperCase() : null);

    // 4. Calculate live metrics to determine default target status
    const metrics = calculateFixedDeposit({
      principal: existing.principalAmount,
      annualRate: existing.annualRate,
      compoundingFrequency: existing.compoundingFrequency as CompoundingFrequency,
      startDate: existing.startDate,
      maturityDate: existing.maturityDate,
      currentDate: new Date(),
    });

    let targetStatus: 'ACTIVE' | 'MATURED';
    if (requestedStatus === 'ACTIVE') {
      targetStatus = 'ACTIVE';
    } else if (requestedStatus === 'MATURED') {
      targetStatus = 'MATURED';
    } else {
      // Auto-detect based on maturity date vs current time
      targetStatus = metrics.isMatured ? 'MATURED' : 'ACTIVE';
    }

    const reason = customReason
      ? String(customReason).trim()
      : `Rolled back deposit from ${existing.status} to ${targetStatus}.`;

    // 5. Update deposit status and record immutable audit ledger event
    const updatedDeposit = await prisma.$transaction(async (tx) => {
      const updated = await tx.fixedDeposit.update({
        where: { id: existing.id },
        data: {
          status: targetStatus,
        },
      });

      await recordAuditLog({
        userId: user.id,
        depositId: updated.id,
        action: 'ROLLED_BACK',
        bankName: updated.bankName,
        accountNumber: updated.accountNumber,
        principalAmount: updated.principalAmount,
        realizedInterest: null,
        penaltyAmount: null,
        dispositionType: 'CORRECTION',
        destinationAccount: null,
        notes: reason,
        snapshotData: {
          action: 'ROLLED_BACK',
          timestamp: new Date().toISOString(),
          previousStatus: existing.status,
          newStatus: targetStatus,
          reason,
          previousState: existing,
          newState: updated,
        },
        tx,
      });

      return updated;
    });

    const enriched = enrichDeposit(updatedDeposit);

    return NextResponse.json(
      {
        success: true,
        message: `Deposit successfully rolled back to ${targetStatus}.`,
        deposit: enriched,
        ...enriched,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[API /api/deposits/[id]/rollback POST] Internal Error:', error);
    return NextResponse.json(
      { error: 'Failed to rollback fixed deposit.' },
      { status: 500 }
    );
  }
});

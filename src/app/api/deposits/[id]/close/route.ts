import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, stripTenantFields } from '@/lib/session';
import { calculateFixedDeposit, roundCurrency, CompoundingFrequency } from '@/lib/financial';
import { recordAuditLog, DispositionType, AuditAction } from '@/lib/audit';

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

function normalizeDisposition(rawType?: string, rawReason?: string): {
  dispositionType: DispositionType;
  action: AuditAction;
} {
  const combined = (rawType || rawReason || '').toUpperCase().trim();
  if (combined.includes('PREMATURE') || combined.includes('LIQUIDAT')) {
    return { dispositionType: 'PREMATURE_WITHDRAWAL', action: 'LIQUIDATED' };
  }
  if (combined.includes('REINVEST') || combined === 'MATURED') {
    return { dispositionType: 'MATURED_REINVESTED', action: 'CLOSED' };
  }
  if (combined.includes('SAVINGS') || combined.includes('TRANSFER')) {
    return { dispositionType: 'TRANSFERRED_SAVINGS', action: 'CLOSED' };
  }
  if (combined.includes('OTHER') || combined.includes('CORRECTION')) {
    return { dispositionType: 'OTHER', action: 'CLOSED' };
  }
  return { dispositionType: 'OTHER', action: 'CLOSED' };
}

/**
 * POST /api/deposits/[id]/close
 * Closes or liquidates deposit with mandatory disposition metadata.
 * Computes netProceeds = principal + realizedInterest - penaltyAmount.
 * Sets status to 'CLOSED' or 'LIQUIDATED' and writes immutable audit log.
 */
export const POST = withAuth(async (request: NextRequest, { user }, routeParams) => {
  try {
    let rawBody: any;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Mandatory disposition metadata required to close deposit.' },
        { status: 400 }
      );
    }

    if (!rawBody || Object.keys(rawBody).length === 0) {
      return NextResponse.json(
        { error: 'Mandatory disposition metadata required to close deposit.' },
        { status: 400 }
      );
    }

    const body = stripTenantFields(rawBody);
    const rawType = body.dispositionType ? String(body.dispositionType).trim() : undefined;
    const rawReason = body.closureReason ? String(body.closureReason).trim() : undefined;

    if (!rawType && !rawReason) {
      return NextResponse.json(
        { error: 'Disposition type or closure reason is required.' },
        { status: 400 }
      );
    }

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
        { error: 'Deposit is already closed or liquidated.' },
        { status: 400 }
      );
    }

    const { dispositionType, action } = normalizeDisposition(rawType, rawReason);

    // Calculate default interest if not supplied
    const calc = calculateFixedDeposit({
      principal: existing.principalAmount,
      annualRate: existing.annualRate,
      compoundingFrequency: existing.compoundingFrequency as CompoundingFrequency,
      startDate: existing.startDate,
      maturityDate: existing.maturityDate,
      currentDate: new Date(),
    });

    const destinationAccount = body.destinationAccount ? String(body.destinationAccount).trim() : null;
    const notes = body.notes ? String(body.notes).trim() : null;
    const penaltyAmount = body.penaltyAmount !== undefined ? Math.max(0, Number(body.penaltyAmount)) : 0;
    const realizedInterest = body.realizedInterest !== undefined
      ? Number(body.realizedInterest)
      : Math.max(0, calc.accruedInterest - penaltyAmount);

    if (isNaN(penaltyAmount) || penaltyAmount < 0) {
      return NextResponse.json({ error: 'Penalty amount cannot be negative.' }, { status: 400 });
    }
    if (isNaN(realizedInterest) || realizedInterest < 0) {
      return NextResponse.json({ error: 'Realized interest cannot be negative.' }, { status: 400 });
    }

    const netProceeds = roundCurrency(existing.principalAmount + realizedInterest - penaltyAmount);
    if (netProceeds < 0) {
      return NextResponse.json(
        { error: 'Penalty amount cannot exceed total principal and realized interest.' },
        { status: 400 }
      );
    }

    const isPremature = dispositionType === 'PREMATURE_WITHDRAWAL' || penaltyAmount > 0;
    const effectiveAction: AuditAction = isPremature ? 'LIQUIDATED' : action;
    const newStatus = effectiveAction === 'LIQUIDATED' ? 'LIQUIDATED' : 'CLOSED';

    const updatedDeposit = await prisma.fixedDeposit.update({
      where: { id: existing.id },
      data: {
        status: newStatus,
      },
    });

    const snapshot = {
      action: effectiveAction,
      timestamp: new Date().toISOString(),
      previousState: existing,
      newState: updatedDeposit,
      dispositionType,
      destinationAccount,
      realizedInterest,
      penaltyAmount,
      netProceeds,
      notes,
    };

    await recordAuditLog({
      userId: user.id,
      depositId: updatedDeposit.id,
      action: effectiveAction,
      bankName: updatedDeposit.bankName,
      accountNumber: updatedDeposit.accountNumber,
      principalAmount: updatedDeposit.principalAmount,
      realizedInterest,
      penaltyAmount,
      dispositionType,
      destinationAccount,
      notes,
      snapshotData: snapshot,
    });

    return NextResponse.json(
      {
        success: true,
        ...updatedDeposit,
        deposit: updatedDeposit,
        id: updatedDeposit.id,
        status: updatedDeposit.status,
        netProceeds,
        realizedInterest,
        penaltyAmount,
        dispositionType,
        destinationAccount,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[API /api/deposits/[id]/close POST] Internal Error:', error);
    return NextResponse.json(
      { error: 'Failed to close fixed deposit.' },
      { status: 500 }
    );
  }
});

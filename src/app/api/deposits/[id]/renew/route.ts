import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, stripTenantFields } from '@/lib/session';
import { calculateFixedDeposit, parseDateUTC, roundCurrency, CompoundingFrequency } from '@/lib/financial';
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
 * POST /api/deposits/[id]/renew
 * Seamlessly renews an existing fixed deposit instrument with the identical account number,
 * applying new tenure dates, updated interest rate, and flexible rollover principal.
 * 
 * In an atomic transaction:
 * 1. Closes the prior certificate with 'MATURED_REINVESTED' disposition and records immutable audit log.
 * 2. Creates the new renewed certificate with the EXACT same account number and bank name.
 * 3. Records a 'CREATED' audit log for the new certificate linking back to the previous deposit.
 */
export const POST = withAuth(async (request: NextRequest, { user }, routeParams) => {
  try {
    const id = await resolveId(routeParams);
    if (!id) {
      return NextResponse.json({ error: 'Deposit not found' }, { status: 404 });
    }

    // 1. Multi-tenant ownership check
    const existing = await prisma.fixedDeposit.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Deposit not found' }, { status: 404 });
    }

    let rawBody: any;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request payload.' },
        { status: 400 }
      );
    }

    const body = stripTenantFields(rawBody);

    // Extract renewed terms
    const rawPrincipal = body.principal !== undefined ? body.principal : body.principalAmount;
    const principal = Number(rawPrincipal);
    const rawRate = body.annualRate !== undefined ? body.annualRate : body.rate;
    const annualRate = Number(rawRate);
    const compoundingFrequency = (
      body.compoundingFrequency
        ? String(body.compoundingFrequency).trim().toUpperCase()
        : existing.compoundingFrequency
    ) as CompoundingFrequency;

    const startDateRaw = body.startDate || existing.maturityDate;
    const maturityDateRaw = body.maturityDate;
    const isAutoRenew = body.isAutoRenew !== undefined ? Boolean(body.isAutoRenew) : existing.isAutoRenew;
    const customNotes = body.notes ? String(body.notes).trim() : null;
    const rolloverOption = body.rolloverOption ? String(body.rolloverOption).trim() : 'FULL_ROLLOVER';

    // Validations
    if (isNaN(principal) || principal <= 0) {
      return NextResponse.json(
        { error: 'Renewed principal amount must be a positive number greater than 0.' },
        { status: 400 }
      );
    }
    if (isNaN(annualRate) || annualRate < 0) {
      return NextResponse.json(
        { error: 'Annual interest rate cannot be negative.' },
        { status: 400 }
      );
    }
    if (!VALID_FREQUENCIES.includes(compoundingFrequency)) {
      return NextResponse.json(
        { error: `Compounding frequency must be one of: ${VALID_FREQUENCIES.join(', ')}.` },
        { status: 400 }
      );
    }
    if (!startDateRaw || !maturityDateRaw) {
      return NextResponse.json(
        { error: 'Renewal start date and maturity date are required.' },
        { status: 400 }
      );
    }

    let startDate: Date;
    let maturityDate: Date;
    try {
      startDate = parseDateUTC(startDateRaw);
      maturityDate = parseDateUTC(maturityDateRaw);
    } catch {
      return NextResponse.json(
        { error: 'Invalid start date or maturity date format.' },
        { status: 400 }
      );
    }

    if (isNaN(startDate.getTime()) || isNaN(maturityDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid start date or maturity date format.' },
        { status: 400 }
      );
    }
    if (maturityDate.getTime() <= startDate.getTime()) {
      return NextResponse.json(
        { error: 'Renewed maturity date must be strictly after the start date.' },
        { status: 400 }
      );
    }

    // Calculate metrics for the previous deposit (realized interest)
    const oldMetrics = calculateFixedDeposit({
      principal: existing.principalAmount,
      annualRate: existing.annualRate,
      compoundingFrequency: existing.compoundingFrequency as CompoundingFrequency,
      startDate: existing.startDate,
      maturityDate: existing.maturityDate,
      currentDate: new Date(),
    });

    const realizedInterest = body.realizedInterest !== undefined
      ? Number(body.realizedInterest)
      : (existing.status === 'MATURED' || oldMetrics.isMatured
          ? oldMetrics.totalInterestEarned
          : oldMetrics.accruedInterest);

    // Calculate metrics for the new renewed deposit
    const newMetrics = calculateFixedDeposit({
      principal,
      annualRate,
      compoundingFrequency,
      startDate,
      maturityDate,
      currentDate: new Date(),
    });

    const destinationAccount = `Renewed Certificate #${existing.accountNumber}`;
    const renewalNotes = customNotes || `Renewed from prior certificate #${existing.accountNumber} with ${annualRate}% interest rate.`;

    // Execute atomic rollover transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Close the previous deposit if not already CLOSED or LIQUIDATED
      let updatedOldDeposit = existing;
      if (existing.status !== 'CLOSED' && existing.status !== 'LIQUIDATED') {
        updatedOldDeposit = await tx.fixedDeposit.update({
          where: { id: existing.id },
          data: {
            status: 'CLOSED',
          },
        });

        // Immutable Audit Log for previous deposit closure
        await recordAuditLog({
          userId: user.id,
          depositId: existing.id,
          action: 'CLOSED',
          bankName: existing.bankName,
          accountNumber: existing.accountNumber,
          principalAmount: existing.principalAmount,
          realizedInterest: roundCurrency(realizedInterest),
          penaltyAmount: 0,
          dispositionType: 'MATURED_REINVESTED',
          destinationAccount,
          notes: `Rolled over into renewed certificate #${existing.accountNumber} with principal ${principal}.`,
          snapshotData: {
            action: 'CLOSED',
            dispositionType: 'MATURED_REINVESTED',
            destinationAccount,
            realizedInterest: roundCurrency(realizedInterest),
            rolloverOption,
            previousState: existing,
            newState: updatedOldDeposit,
            notes: 'Matured and reinvested into same account number.',
          },
          tx,
        });
      }

      // 2. Create the newly renewed certificate with the IDENTICAL account number
      const renewedDeposit = await tx.fixedDeposit.create({
        data: {
          userId: user.id,
          bankName: existing.bankName,
          accountNumber: existing.accountNumber, // Preserved identically
          principalAmount: Math.round(principal),
          annualRate,
          compoundingFrequency,
          startDate,
          maturityDate,
          maturityAmount: Math.round(newMetrics.maturityAmount),
          totalInterestEarned: Math.round(newMetrics.totalInterestEarned),
          status: newMetrics.isMatured ? 'MATURED' : 'ACTIVE',
          isAutoRenew,
          notes: renewalNotes,
        },
      });

      // 3. Immutable Audit Log for the newly created renewed certificate
      await recordAuditLog({
        userId: user.id,
        depositId: renewedDeposit.id,
        action: 'CREATED',
        bankName: renewedDeposit.bankName,
        accountNumber: renewedDeposit.accountNumber,
        principalAmount: renewedDeposit.principalAmount,
        notes: `Certificate renewed with same account #${renewedDeposit.accountNumber}. Prior contract ID: ${existing.id}.`,
        snapshotData: {
          action: 'CREATED',
          renewal: true,
          priorDepositId: existing.id,
          priorDepositMaturity: existing.maturityDate,
          rolloverOption,
          previousState: existing,
          newState: renewedDeposit,
        },
        tx,
      });

      return {
        oldDeposit: updatedOldDeposit,
        renewedDeposit,
      };
    });

    const enrichedRenewed = enrichDeposit(result.renewedDeposit);

    return NextResponse.json(
      {
        success: true,
        message: `Fixed deposit renewed successfully with account number ${existing.accountNumber}.`,
        oldDeposit: result.oldDeposit,
        deposit: enrichedRenewed,
        renewedDeposit: enrichedRenewed,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[API /api/deposits/[id]/renew POST] Internal Error:', error);
    return NextResponse.json(
      { error: 'Failed to renew fixed deposit.' },
      { status: 500 }
    );
  }
});

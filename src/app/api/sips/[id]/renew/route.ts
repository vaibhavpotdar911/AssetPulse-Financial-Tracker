import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/session';
import { calculateNextSipDate, calculateRecurringDeposit, SipFrequency } from '@/lib/financial';

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

/**
 * POST /api/sips/[id]/renew
 * Renews a Recurring Deposit or Systematic Investment Plan schedule with the identical folio / account number,
 * resetting execution count for the new cycle with new tenure and/or interest rates.
 */
export const POST = withAuth(async (request: NextRequest, { user }, routeParams) => {
  try {
    const id = await resolveId(routeParams);
    if (!id) {
      return NextResponse.json({ success: false, error: 'SIP/RD ID required' }, { status: 400 });
    }

    const existing = await prisma.sipSchedule.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'SIP/RD schedule not found' }, { status: 404 });
    }

    const body = await request.json();

    const installmentAmount = body.installmentAmount !== undefined
      ? parseFloat(body.installmentAmount)
      : existing.installmentAmount;

    if (isNaN(installmentAmount) || installmentAmount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Installment amount must be greater than zero' },
        { status: 400 }
      );
    }

    const frequency = body.frequency || existing.frequency;
    const start = body.startDate ? new Date(body.startDate) : new Date();
    const end = body.endDate ? new Date(body.endDate) : null;
    const dayOfWeek = body.dayOfWeek !== undefined ? body.dayOfWeek : existing.dayOfWeek;
    const dayOfMonth = body.dayOfMonth !== undefined ? body.dayOfMonth : existing.dayOfMonth;

    let annualRate: number | null = existing.annualRate;
    let tenureMonths: number | null = existing.tenureMonths;
    let compoundingFrequency: string | null = existing.compoundingFrequency;
    let targetMaturityAmount: number | null = existing.targetMaturityAmount;

    if (existing.assetType === 'RECURRING_DEPOSIT') {
      if (body.annualRate !== undefined && body.annualRate !== '') {
        annualRate = parseFloat(body.annualRate);
      }
      if (body.tenureMonths !== undefined && body.tenureMonths !== '') {
        tenureMonths = parseInt(body.tenureMonths, 10);
      }
      if (body.compoundingFrequency) {
        compoundingFrequency = body.compoundingFrequency;
      }

      if (annualRate && tenureMonths) {
        const rdCalc = calculateRecurringDeposit({
          monthlyInstallment: installmentAmount,
          annualRate,
          tenureMonths,
          compoundingFrequency: compoundingFrequency === 'MONTHLY' ? 'MONTHLY' : 'QUARTERLY',
        });
        targetMaturityAmount = rdCalc.maturityAmount;
      }
    }

    const nextDate = calculateNextSipDate({
      frequency: frequency as SipFrequency,
      fromDate: start,
      dayOfWeek: dayOfWeek ? parseInt(dayOfWeek, 10) : undefined,
      dayOfMonth: dayOfMonth ? parseInt(dayOfMonth, 10) : undefined,
    });

    const renewalNotes = body.notes?.trim() || `Renewed from RD/SIP schedule #${existing.id} with account/folio #${existing.folioNumber || 'N/A'}`;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Mark previous schedule as COMPLETED
      const updatedOld = await tx.sipSchedule.update({
        where: { id: existing.id },
        data: {
          status: 'COMPLETED',
        },
      });

      // 2. Create the renewed RD/SIP schedule with the identical folio / account number
      const renewed = await tx.sipSchedule.create({
        data: {
          userId: user.id,
          name: existing.name,
          assetType: existing.assetType,
          frequency,
          installmentAmount,
          dayOfWeek: dayOfWeek ? parseInt(dayOfWeek, 10) : null,
          dayOfMonth: dayOfMonth ? parseInt(dayOfMonth, 10) : null,
          startDate: start,
          endDate: end,
          schemeCode: existing.schemeCode,
          schemeName: existing.schemeName,
          folioNumber: existing.folioNumber, // Same account number preserved
          annualRate,
          tenureMonths,
          compoundingFrequency,
          targetMaturityAmount,
          nextExecutionDate: nextDate,
          notes: renewalNotes,
          status: 'ACTIVE',
          totalInvested: 0,
          installmentsExecuted: 0,
        },
      });

      return { oldSip: updatedOld, renewedSip: renewed };
    });

    return NextResponse.json(
      {
        success: true,
        message: `Recurring Deposit / SIP renewed successfully with folio/account number ${existing.folioNumber || 'N/A'}.`,
        oldSip: result.oldSip,
        sip: result.renewedSip,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('Error renewing SIP schedule:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to renew SIP schedule' },
      { status: 500 }
    );
  }
});

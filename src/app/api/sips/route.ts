import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/session';
import { calculateNextSipDate, calculateRecurringDeposit, SipFrequency } from '@/lib/financial';

export const dynamic = 'force-dynamic';

/**
 * GET /api/sips
 * Returns all active & paused SIP schedules and recurring deposits for the authenticated user,
 * along with their upcoming executions.
 */
export const GET = withAuth(async (request: NextRequest, { user }) => {
  try {
    const sips = await prisma.sipSchedule.findMany({
      where: { userId: user.id },
      include: {
        executions: {
          orderBy: { executionDate: 'desc' },
          take: 5,
        },
      },
      orderBy: { nextExecutionDate: 'asc' },
    });

    // Compute total monthly SIP commitment
    let totalMonthlyCommitment = 0;
    for (const sip of sips) {
      if (sip.status === 'ACTIVE') {
        if (sip.frequency === 'DAILY') {
          totalMonthlyCommitment += sip.installmentAmount * 30;
        } else if (sip.frequency === 'WEEKLY') {
          totalMonthlyCommitment += sip.installmentAmount * 4.33;
        } else {
          totalMonthlyCommitment += sip.installmentAmount;
        }
      }
    }

    return NextResponse.json({
      success: true,
      sips,
      totalMonthlyCommitment: Math.round(totalMonthlyCommitment * 100) / 100,
    });
  } catch (err: any) {
    console.error('Error fetching SIP schedules:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve SIP schedules' },
      { status: 500 }
    );
  }
});

/**
 * POST /api/sips
 * Creates a new Systematic Investment Plan or Recurring Deposit schedule.
 */
export const POST = withAuth(async (request: NextRequest, { user }) => {
  try {
    const body = await request.json();

    const {
      name,
      assetType, // 'MUTUAL_FUND' | 'RECURRING_DEPOSIT' | 'STOCK'
      frequency, // 'DAILY' | 'WEEKLY' | 'MONTHLY'
      installmentAmount,
      dayOfWeek,
      dayOfMonth,
      startDate,
      endDate,
      schemeCode,
      schemeName,
      folioNumber,
      annualRate,
      tenureMonths,
      compoundingFrequency,
      notes,
    } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ success: false, error: 'SIP or RD name is required' }, { status: 400 });
    }

    const amountNum = parseFloat(installmentAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return NextResponse.json({ success: false, error: 'Installment amount must be greater than zero' }, { status: 400 });
    }

    if (!['MUTUAL_FUND', 'RECURRING_DEPOSIT', 'STOCK'].includes(assetType)) {
      return NextResponse.json({ success: false, error: 'Invalid asset type' }, { status: 400 });
    }

    if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(frequency)) {
      return NextResponse.json({ success: false, error: 'Invalid frequency' }, { status: 400 });
    }

    const start = startDate ? new Date(startDate) : new Date();
    const end = endDate ? new Date(endDate) : null;

    // Calculate initial next execution date
    const nextDate = calculateNextSipDate({
      frequency: frequency as SipFrequency,
      fromDate: start,
      dayOfWeek: dayOfWeek ? parseInt(dayOfWeek, 10) : undefined,
      dayOfMonth: dayOfMonth ? parseInt(dayOfMonth, 10) : undefined,
    });

    let targetMaturityAmount: number | null = null;
    let rateNum: number | null = null;
    let monthsNum: number | null = null;

    if (assetType === 'RECURRING_DEPOSIT' && annualRate && tenureMonths) {
      rateNum = parseFloat(annualRate);
      monthsNum = parseInt(tenureMonths, 10);
      const rdCalc = calculateRecurringDeposit({
        monthlyInstallment: amountNum,
        annualRate: rateNum,
        tenureMonths: monthsNum,
        compoundingFrequency: compoundingFrequency === 'MONTHLY' ? 'MONTHLY' : 'QUARTERLY',
      });
      targetMaturityAmount = rdCalc.maturityAmount;
    }

    const sip = await prisma.sipSchedule.create({
      data: {
        userId: user.id,
        name: name.trim(),
        assetType,
        frequency,
        installmentAmount: amountNum,
        dayOfWeek: dayOfWeek ? parseInt(dayOfWeek, 10) : null,
        dayOfMonth: dayOfMonth ? parseInt(dayOfMonth, 10) : null,
        startDate: start,
        endDate: end,
        schemeCode: schemeCode?.trim() || null,
        schemeName: schemeName?.trim() || null,
        folioNumber: folioNumber?.trim() || null,
        annualRate: rateNum,
        tenureMonths: monthsNum,
        compoundingFrequency: compoundingFrequency || null,
        targetMaturityAmount,
        nextExecutionDate: nextDate,
        notes: notes?.trim() || null,
        status: 'ACTIVE',
      },
    });

    return NextResponse.json({ success: true, sip }, { status: 201 });
  } catch (err: any) {
    console.error('Error creating SIP schedule:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to create SIP schedule' },
      { status: 500 }
    );
  }
});

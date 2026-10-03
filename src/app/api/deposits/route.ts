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

/**
 * Formats a Prisma FixedDeposit with dynamic real-time financial metrics.
 */
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
    principal: deposit.principalAmount, // Dual compatibility
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
 * GET /api/deposits
 * Multi-tenant query scoped to session.userId.
 * Supports status filtering ('ACTIVE', 'CLOSED', 'LIQUIDATED', 'MATURED', 'ALL'), bank search, and sorting.
 */
export const GET = withAuth(async (request: NextRequest, { user }) => {
  try {
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status')?.trim().toUpperCase();
    const bankNameParam = searchParams.get('bankName')?.trim();
    const searchParam = searchParams.get('search')?.trim();
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = (searchParams.get('sortOrder')?.toLowerCase() === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';

    const whereClause: any = {
      userId: user.id,
    };

    // Status filtering: 'ACTIVE', 'CLOSED', 'LIQUIDATED', 'MATURED', or 'ALL'
    if (statusParam && statusParam !== 'ALL') {
      whereClause.status = statusParam;
    }

    // Bank name filter
    if (bankNameParam) {
      whereClause.bankName = {
        contains: bankNameParam,
      };
    }

    // Free text search across bank name or account number
    if (searchParam) {
      whereClause.OR = [
        { bankName: { contains: searchParam } },
        { accountNumber: { contains: searchParam } },
      ];
    }

    // Determine orderBy field
    let orderBy: any = { createdAt: 'desc' };
    if (sortBy === 'maturityDate') {
      orderBy = { maturityDate: sortOrder };
    } else if (sortBy === 'principal' || sortBy === 'principalAmount') {
      orderBy = { principalAmount: sortOrder };
    } else if (sortBy === 'annualRate') {
      orderBy = { annualRate: sortOrder };
    } else if (sortBy === 'bankName') {
      orderBy = { bankName: sortOrder };
    } else if (sortBy === 'createdAt') {
      orderBy = { createdAt: sortOrder };
    }

    const rawDeposits = await prisma.fixedDeposit.findMany({
      where: whereClause,
      orderBy,
    });

    const enrichedDeposits = rawDeposits.map(enrichDeposit);

    return NextResponse.json(enrichedDeposits, { status: 200 });
  } catch (error: any) {
    console.error('[API /api/deposits GET] Internal Error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve fixed deposits.' },
      { status: 500 }
    );
  }
});

/**
 * POST /api/deposits
 * Validates payload, strips client userId, creates FixedDeposit, and triggers CREATED audit log.
 */
export const POST = withAuth(async (request: NextRequest, { user }) => {
  try {
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

    const bankName = String(body.bankName || '').trim();
    const accountNumber = String(body.accountNumber || '').trim();
    const rawPrincipal = body.principal !== undefined ? body.principal : body.principalAmount;
    const principal = Number(rawPrincipal);
    const rawRate = body.annualRate !== undefined ? body.annualRate : body.rate;
    const annualRate = Number(rawRate);
    const compoundingFrequency = String(body.compoundingFrequency || '').trim().toUpperCase() as CompoundingFrequency;
    const startDateRaw = body.startDate;
    const maturityDateRaw = body.maturityDate;
    const notes = body.notes ? String(body.notes).trim() : null;
    const isAutoRenew = Boolean(body.isAutoRenew);

    // Validation
    if (!bankName) {
      return NextResponse.json({ error: 'Bank name is required.' }, { status: 400 });
    }
    if (!accountNumber) {
      return NextResponse.json({ error: 'Account number is required.' }, { status: 400 });
    }
    if (isNaN(principal) || principal <= 0) {
      return NextResponse.json(
        { error: 'Principal amount must be a positive number greater than 0.' },
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
      return NextResponse.json({ error: 'Start date and maturity date are required.' }, { status: 400 });
    }

    let startDate: Date;
    let maturityDate: Date;
    try {
      startDate = parseDateUTC(startDateRaw);
      maturityDate = parseDateUTC(maturityDateRaw);
    } catch {
      return NextResponse.json({ error: 'Invalid start date or maturity date format.' }, { status: 400 });
    }

    if (isNaN(startDate.getTime()) || isNaN(maturityDate.getTime())) {
      return NextResponse.json({ error: 'Invalid start date or maturity date format.' }, { status: 400 });
    }
    if (maturityDate.getTime() <= startDate.getTime()) {
      return NextResponse.json(
        { error: 'Maturity date must be strictly after the start date.' },
        { status: 400 }
      );
    }

    // Compute initial projections
    const metrics = calculateFixedDeposit({
      principal,
      annualRate,
      compoundingFrequency,
      startDate,
      maturityDate,
      currentDate: new Date(),
    });

    // Create record in database
    const deposit = await prisma.fixedDeposit.create({
      data: {
        userId: user.id,
        bankName,
        accountNumber,
        principalAmount: principal,
        annualRate,
        compoundingFrequency,
        startDate,
        maturityDate,
        maturityAmount: metrics.maturityAmount,
        totalInterestEarned: metrics.totalInterestEarned,
        status: metrics.isMatured ? 'MATURED' : 'ACTIVE',
        isAutoRenew,
        notes,
      },
    });

    // Trigger CREATED audit log
    await recordAuditLog({
      userId: user.id,
      depositId: deposit.id,
      action: 'CREATED',
      bankName: deposit.bankName,
      accountNumber: deposit.accountNumber,
      principalAmount: deposit.principalAmount,
      snapshotData: {
        action: 'CREATED',
        timestamp: new Date().toISOString(),
        newState: deposit,
      },
      notes: notes || 'Initial creation of fixed deposit.',
    });

    const enriched = enrichDeposit(deposit);
    return NextResponse.json(enriched, { status: 201 });
  } catch (error: any) {
    console.error('[API /api/deposits POST] Internal Error:', error);
    return NextResponse.json(
      { error: 'Failed to create fixed deposit.' },
      { status: 500 }
    );
  }
});

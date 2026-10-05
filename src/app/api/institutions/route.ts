import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/session';

/**
 * GET /api/institutions
 * Returns all distinct institutions (bank names) previously used by the authenticated user
 * in their deposits or audit logs, ordered by most recently used.
 */
export const GET = withAuth(async (request: NextRequest, { user }) => {
  try {
    // 1. Fetch distinct bank names from user's fixed deposits
    const deposits = await prisma.fixedDeposit.findMany({
      where: { userId: user.id },
      select: { bankName: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });

    // 2. Fetch distinct bank names from user's audit logs (in case deposits were deleted/closed)
    const auditLogs = await prisma.auditLog.findMany({
      where: { userId: user.id },
      select: { bankName: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    // 3. Build a distinct, recently used list
    const institutionMap = new Map<string, Date>();

    for (const d of deposits) {
      const name = d.bankName?.trim();
      if (name && !institutionMap.has(name)) {
        institutionMap.set(name, d.updatedAt);
      }
    }

    for (const a of auditLogs) {
      const name = a.bankName?.trim();
      if (name && !institutionMap.has(name)) {
        institutionMap.set(name, a.createdAt);
      }
    }

    // Sort by recent activity
    const userInstitutions = Array.from(institutionMap.entries())
      .sort((a, b) => b[1].getTime() - a[1].getTime())
      .map(([name]) => name);

    return NextResponse.json({
      success: true,
      institutions: userInstitutions,
    });
  } catch (error: any) {
    console.error('Error fetching user institutions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch user institutions' },
      { status: 500 }
    );
  }
});

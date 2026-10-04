import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * GET /api/notifications
 * Multi-tenant notifications list scoped strictly to session user.
 * Supports unreadOnly, pagination (limit, offset/page), and notification type filtering.
 * Returns notifications array alongside total and unreadCount.
 */
export const GET = withAuth(async (request: NextRequest, { user }) => {
  try {
    const { searchParams } = new URL(request.url);
    const unreadOnlyParam = searchParams.get('unreadOnly')?.trim().toLowerCase();
    const typeParam = searchParams.get('type')?.trim().toUpperCase();
    const limitParam = parseInt(searchParams.get('limit') || '20', 10);
    const pageParam = parseInt(searchParams.get('page') || '1', 10);
    const offsetParam = searchParams.get('offset')
      ? parseInt(searchParams.get('offset')!, 10)
      : (Math.max(1, pageParam) - 1) * Math.max(1, limitParam);

    const limit = Math.min(Math.max(1, isNaN(limitParam) ? 20 : limitParam), 100);
    const offset = Math.max(0, isNaN(offsetParam) ? 0 : offsetParam);

    const whereClause: any = {
      userId: user.id,
    };

    if (unreadOnlyParam === 'true' || unreadOnlyParam === '1') {
      whereClause.isRead = false;
    }

    if (typeParam && typeParam !== 'ALL') {
      whereClause.type = typeParam;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          deposit: {
            select: {
              id: true,
              bankName: true,
              accountNumber: true,
              principalAmount: true,
              maturityAmount: true,
              maturityDate: true,
              status: true,
            },
          },
        },
      }),
      prisma.notification.count({ where: whereClause }),
      prisma.notification.count({
        where: {
          userId: user.id,
          isRead: false,
        },
      }),
    ]);

    return NextResponse.json(
      {
        notifications,
        unreadCount,
        total,
        limit,
        offset,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[API /api/notifications GET] Internal Error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve notifications.' },
      { status: 500 }
    );
  }
});

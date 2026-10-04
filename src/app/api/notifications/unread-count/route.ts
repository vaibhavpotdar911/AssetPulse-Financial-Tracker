import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * GET /api/notifications/unread-count
 * Lightweight unread notification counter for background polling.
 */
export const GET = withAuth(async (request: NextRequest, { user }) => {
  try {
    const unreadCount = await prisma.notification.count({
      where: {
        userId: user.id,
        isRead: false,
      },
    });

    return NextResponse.json({ unreadCount }, { status: 200 });
  } catch (error: any) {
    console.error('[API /api/notifications/unread-count GET] Internal Error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve unread count.' },
      { status: 500 }
    );
  }
});

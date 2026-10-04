import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * POST /api/notifications/mark-all-read
 * Scoped to authenticated user.
 * Bulk updates all unread notifications for the user to isRead: true.
 * Returns the count of marked notifications.
 */
export const POST = withAuth(async (request: NextRequest, { user }) => {
  try {
    const result = await prisma.notification.updateMany({
      where: {
        userId: user.id,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        success: true,
        count: result.count,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[API /api/notifications/mark-all-read POST] Internal Error:', error);
    return NextResponse.json(
      { error: 'Failed to mark notifications as read.' },
      { status: 500 }
    );
  }
});

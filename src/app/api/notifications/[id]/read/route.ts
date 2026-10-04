import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/session';

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
 * PATCH /api/notifications/[id]/read
 * Scoped to authenticated session user.
 * Marks specified notification as read with readAt timestamp.
 * Returns 404 if notification does not exist or belongs to another user.
 */
export const PATCH = withAuth(async (request: NextRequest, { user }, routeParams) => {
  try {
    const id = await resolveId(routeParams);
    if (!id) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    const existing = await prisma.notification.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    const updated = await prisma.notification.update({
      where: { id: existing.id },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        success: true,
        notification: updated,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[API /api/notifications/[id]/read PATCH] Internal Error:', error);
    return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
  }
});

/**
 * PUT alias for compatibility with HTTP clients using PUT.
 */
export const PUT = PATCH;

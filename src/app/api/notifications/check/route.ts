import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/session';
import { scanMaturityAlertsForUser } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

/**
 * POST /api/notifications/check
 * On-demand maturity scan endpoint scoped to authenticated user.
 * Triggers proximity detection, creates deduplicated notifications, and dispatches webhooks.
 */
export const POST = withAuth(async (request: NextRequest, { user }) => {
  try {
    const result = await scanMaturityAlertsForUser(user.id);
    return NextResponse.json(
      {
        success: true,
        userId: user.id,
        scanned: result.scanned,
        notificationsCreated: result.notificationsCreated,
        webhooksDispatched: result.webhooksDispatched,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[API /api/notifications/check POST] Internal Error:', error);
    return NextResponse.json(
      { error: 'Failed to execute maturity scan.' },
      { status: 500 }
    );
  }
});

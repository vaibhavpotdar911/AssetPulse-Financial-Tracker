import { NextRequest, NextResponse } from 'next/server';
import { scanAllMaturityAlerts } from '@/lib/notifications';
import { getSessionFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Validates cron secret token against request headers, query parameters, or session.
 */
async function isAuthorizedCronRequest(request: NextRequest): Promise<{ authorized: boolean; reason?: string }> {
  const configuredSecret = process.env.CRON_SECRET?.trim();

  // 1. Session user fallback
  const sessionUser = await getSessionFromRequest(request);
  if (sessionUser) {
    return { authorized: true };
  }

  // 2. Development mode fallback
  if (
    process.env.NODE_ENV !== 'production' &&
    (!configuredSecret || configuredSecret === 'assetpulse-cron-secret-token')
  ) {
    return { authorized: true };
  }

  if (!configuredSecret) {
    return {
      authorized: false,
      reason: 'CRON_SECRET environment variable is not defined on the running server container.',
    };
  }

  // 3. Bearer Authorization Header
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.substring(7).trim();
    if (bearerToken === configuredSecret) {
      return { authorized: true };
    }
  }

  // 4. Custom x-cron-secret Header
  const xCronSecret = request.headers.get('x-cron-secret')?.trim();
  if (xCronSecret === configuredSecret) {
    return { authorized: true };
  }

  // 5. Query Parameter ?token= or ?secret=
  const { searchParams } = new URL(request.url);
  const queryToken = searchParams.get('token')?.trim() || searchParams.get('secret')?.trim();
  if (queryToken === configuredSecret) {
    return { authorized: true };
  }

  return {
    authorized: false,
    reason: 'Provided secret token does not match server CRON_SECRET.',
  };
}

/**
 * Handles cron maturity execution across all tenants.
 */
async function handleCronExecution(request: NextRequest): Promise<NextResponse> {
  try {
    const authResult = await isAuthorizedCronRequest(request);
    if (!authResult.authorized) {
      console.warn(
        `[API /api/cron/maturity-check] Unauthorized cron attempt: ${authResult.reason} (Server has CRON_SECRET configured: ${Boolean(process.env.CRON_SECRET)})`
      );
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Invalid or missing cron authorization credentials.',
          diagnostic: authResult.reason,
          serverConfiguredSecret: Boolean(process.env.CRON_SECRET),
        },
        { status: 401 }
      );
    }

    // Execute scan across all active tenants
    const results = await scanAllMaturityAlerts();

    const totalScanned = results.reduce((sum, r) => sum + (r.scanned || 0), 0);
    const totalCreated = results.reduce((sum, r) => sum + r.notificationsCreated, 0);
    const totalWebhooks = results.reduce((sum, r) => sum + r.webhooksDispatched, 0);

    return NextResponse.json(
      {
        success: true,
        scanned: totalScanned,
        alertsCreated: totalCreated,
        webhooksDispatched: totalWebhooks,
        timestamp: new Date().toISOString(),
        details: results,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[API /api/cron/maturity-check] Execution failed:', error);
    return NextResponse.json(
      {
        error: 'Cron maturity scan failed.',
        details: error?.message || 'Unknown internal error',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return handleCronExecution(request);
}

export async function POST(request: NextRequest) {
  return handleCronExecution(request);
}

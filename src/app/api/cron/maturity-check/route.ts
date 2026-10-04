import { NextRequest, NextResponse } from 'next/server';
import { scanAllMaturityAlerts } from '@/lib/notifications';
import { getSessionFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Validates cron secret token against request headers, query parameters, or session.
 */
async function isAuthorizedCronRequest(request: NextRequest): Promise<boolean> {
  const configuredSecret = process.env.CRON_SECRET?.trim();

  // 1. Session user fallback
  const sessionUser = await getSessionFromRequest(request);
  if (sessionUser) {
    return true;
  }

  // 2. Development mode fallback
  if (
    process.env.NODE_ENV !== 'production' &&
    (!configuredSecret || configuredSecret === 'assetpulse-cron-secret-token')
  ) {
    return true;
  }

  // 3. Bearer Authorization Header
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.substring(7).trim();
    if (configuredSecret && bearerToken === configuredSecret) {
      return true;
    }
  }

  // 4. Custom x-cron-secret Header
  const xCronSecret = request.headers.get('x-cron-secret')?.trim();
  if (configuredSecret && xCronSecret === configuredSecret) {
    return true;
  }

  // 5. Query Parameter ?token= or ?secret=
  const { searchParams } = new URL(request.url);
  const queryToken = searchParams.get('token')?.trim() || searchParams.get('secret')?.trim();
  if (configuredSecret && queryToken === configuredSecret) {
    return true;
  }

  return false;
}

/**
 * Handles cron maturity execution across all tenants.
 */
async function handleCronExecution(request: NextRequest): Promise<NextResponse> {
  try {
    const authorized = await isAuthorizedCronRequest(request);
    if (!authorized) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Invalid or missing cron authorization credentials.',
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

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import {
  queryAuditLogsForUser,
  countAuditLogsForUser,
  AuditLogFilterOptions,
} from '@/lib/audit';

export const dynamic = 'force-dynamic';

// ============================================================================
// 1. GET: Read-Only Audit Log Ledger
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate session
    const sessionUser = await getSessionFromRequest(request);
    if (!sessionUser) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required to access audit logs.' },
        { status: 401 }
      );
    }

    // 2. Extract query parameters
    const { searchParams } = new URL(request.url);

    const action = searchParams.get('action') || undefined;
    const entityId = searchParams.get('entityId') || searchParams.get('depositId') || undefined;
    const bankName = searchParams.get('bankName') || undefined;
    const startDate = searchParams.get('startDate') || searchParams.get('fromDate') || undefined;
    const endDate = searchParams.get('endDate') || searchParams.get('toDate') || undefined;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const envelope = searchParams.get('envelope') === 'true' || searchParams.get('format') === 'paginated';

    const filters: AuditLogFilterOptions = {
      action,
      entityId,
      depositId: entityId,
      bankName,
      startDate,
      endDate,
      page,
      limit,
    };

    // 3. Execute isolated queries in parallel
    const [logs, total] = await Promise.all([
      queryAuditLogsForUser(sessionUser.id, filters),
      countAuditLogsForUser(sessionUser.id, filters),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    // 4. Construct pagination response headers
    const headers = new Headers({
      'Content-Type': 'application/json',
      'X-Total-Count': String(total),
      'X-Page': String(page),
      'X-Limit': String(limit),
      'X-Total-Pages': String(totalPages),
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });

    // 5. Response formatting
    if (envelope) {
      return NextResponse.json(
        {
          success: true,
          data: logs,
          pagination: {
            total,
            page,
            limit,
            totalPages,
          },
        },
        { status: 200, headers }
      );
    }

    // Default response: raw array to satisfy test suites
    return NextResponse.json(logs, { status: 200, headers });
  } catch (error: any) {
    console.error('[AssetPulse API /api/audit-logs] GET error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error?.message || 'Failed to fetch audit logs.' },
      { status: 500 }
    );
  }
}

// ============================================================================
// 2. Strict Immutability Guards: Reject All Direct Mutation Requests (405)
// ============================================================================

export async function POST() {
  return NextResponse.json(
    {
      error: 'Method Not Allowed',
      message: 'Audit logs are strictly immutable and append-only. New entries are created via domain actions.',
    },
    { status: 405, headers: { Allow: 'GET' } }
  );
}

export async function PUT() {
  return NextResponse.json(
    {
      error: 'Method Not Allowed',
      message: 'Audit logs cannot be modified. All entries are cryptographically and logically immutable.',
    },
    { status: 405, headers: { Allow: 'GET' } }
  );
}

export async function PATCH() {
  return NextResponse.json(
    {
      error: 'Method Not Allowed',
      message: 'Audit logs cannot be patched.',
    },
    { status: 405, headers: { Allow: 'GET' } }
  );
}

export async function DELETE() {
  return NextResponse.json(
    {
      error: 'Method Not Allowed',
      message: 'Audit logs cannot be deleted.',
    },
    { status: 405, headers: { Allow: 'GET' } }
  );
}

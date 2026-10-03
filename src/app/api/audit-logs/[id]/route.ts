import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { safeDeserializeJson } from '@/lib/audit';

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

export async function GET(
  request: NextRequest,
  routeParams?: any
) {
  try {
    const sessionUser = await getSessionFromRequest(request);
    if (!sessionUser) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required.' },
        { status: 401 }
      );
    }

    const logId = await resolveId(routeParams);
    if (!logId) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Audit Log ID is required.' },
        { status: 400 }
      );
    }

    // Strict multi-tenant scoped retrieval
    const log = await prisma.auditLog.findFirst({
      where: {
        id: logId,
        userId: sessionUser.id,
      },
    });

    if (!log) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Audit log entry not found.' },
        { status: 404 }
      );
    }

    const parsedSnapshot = safeDeserializeJson(log.snapshotData);

    return NextResponse.json(
      {
        success: true,
        data: {
          ...log,
          snapshot: parsedSnapshot,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[AssetPulse API /api/audit-logs/[id]] GET error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error?.message || 'Failed to fetch audit log.' },
      { status: 500 }
    );
  }
}

export async function PUT() {
  return NextResponse.json(
    {
      error: 'Method Not Allowed',
      message: 'Audit logs are immutable. Tampering or editing historical entries is prohibited.',
    },
    { status: 405, headers: { Allow: 'GET' } }
  );
}

export async function DELETE() {
  return NextResponse.json(
    {
      error: 'Method Not Allowed',
      message: 'Audit logs are immutable. Deletion of historical audit records is prohibited.',
    },
    { status: 405, headers: { Allow: 'GET' } }
  );
}

export async function PATCH() {
  return NextResponse.json(
    {
      error: 'Method Not Allowed',
      message: 'Audit logs cannot be modified.',
    },
    { status: 405, headers: { Allow: 'GET' } }
  );
}

export async function POST() {
  return NextResponse.json(
    {
      error: 'Method Not Allowed',
      message: 'Method Not Allowed on resource instance.',
    },
    { status: 405, headers: { Allow: 'GET' } }
  );
}

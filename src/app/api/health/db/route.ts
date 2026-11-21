import { NextResponse } from 'next/server';
import { checkDatabaseConnection, getDatabaseType, getSafeDatabaseHost } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const dbType = getDatabaseType();
  const hostInfo = getSafeDatabaseHost();
  const health = await checkDatabaseConnection();

  return NextResponse.json({
    success: true,
    connected: health.connected,
    provider: health.provider,
    dialectLabel: health.provider === 'mysql' ? 'MySQL' : 'SQLite (fintrack.db)',
    target: hostInfo,
    error: health.error || null,
  });
}

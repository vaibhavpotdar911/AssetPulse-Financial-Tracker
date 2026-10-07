import { NextResponse } from 'next/server';
import { checkDatabaseConnection, getDatabaseType } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const dbType = getDatabaseType();
  const dbUrl = process.env.DATABASE_URL || '';

  // Parse safe display host for MySQL without exposing passwords or credentials
  let hostInfo = 'local file (fintrack.db)';
  if (dbType === 'mysql') {
    try {
      const parsed = new URL(dbUrl);
      hostInfo = `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}`;
    } catch {
      hostInfo = 'external mysql instance';
    }
  }

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

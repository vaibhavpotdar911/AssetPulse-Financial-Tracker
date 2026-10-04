/**
 * AssetPulse - Global Prisma Client Singleton
 * 
 * Ensures a single shared instance of PrismaClient in development mode
 * across Next.js App Router hot module reloads, preventing connection leaks.
 */

import { PrismaClient } from '@prisma/client';

declare global {
  // Allows global `var` across hot-reloads in Node runtime
  // eslint-disable-next-line no-var
  var __assetpulse_prisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__assetpulse_prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__assetpulse_prisma = prisma;
}

/**
 * Returns the detected active database provider dialect.
 */
export function getDatabaseType(): 'sqlite' | 'mysql' {
  const dbUrl = process.env.DATABASE_URL || '';
  const dbType = (process.env.DB_TYPE || '').toLowerCase();

  if (dbType === 'mysql' || dbUrl.startsWith('mysql://') || dbUrl.startsWith('mysql:')) {
    return 'mysql';
  }
  return 'sqlite';
}

/**
 * Performs a lightweight health check query against the active database.
 */
export async function checkDatabaseConnection(): Promise<{
  connected: boolean;
  provider: 'sqlite' | 'mysql';
  error?: string;
}> {
  const provider = getDatabaseType();
  try {
    // Both SQLite and MySQL support standard ANSI SELECT 1
    await prisma.$queryRawUnsafe('SELECT 1');
    return { connected: true, provider };
  } catch (err: any) {
    return {
      connected: false,
      provider,
      error: err?.message || 'Unknown database connection error',
    };
  }
}

export default prisma;

/**
 * AssetPulse - Global Prisma Client Singleton & Database Connection Manager
 * 
 * Ensures a single shared instance of PrismaClient across hot reloads in development
 * and across bundled Next.js App Router chunks in production, preventing connection leaks.
 * Automatically tunes connection parameters (connect_timeout, pool_timeout) for resilient
 * operation in containerized and cloud Kubernetes environments.
 */

import { PrismaClient } from '@prisma/client';

declare global {
  // Allows global `var` across hot-reloads and bundled chunks in Node runtime
  // eslint-disable-next-line no-var
  var __assetpulse_prisma: PrismaClient | undefined;
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
 * Extracts and sanitizes the database target host/info for logging and health checks,
 * completely scrubbing user credentials and passwords.
 */
export function getSafeDatabaseHost(rawUrl?: string): string {
  const urlStr = rawUrl || process.env.DATABASE_URL || '';
  if (!urlStr) return 'none';
  if (urlStr.startsWith('file:')) return 'local file (fintrack.db)';

  try {
    if (urlStr.includes('@')) {
      const afterAt = urlStr.split('@')[1];
      const hostAndDb = afterAt.split('?')[0];
      return hostAndDb; // e.g. "db.vaibhavpotdar.tech:3306/fintrack_app"
    }
  } catch {
    // fallback
  }
  return 'external database';
}

/**
 * Normalizes and tunes the database connection URL for production stability.
 * For MySQL over network/k8s:
 * - Appends connect_timeout=30 if not present (Prisma default 5s is too aggressive for WAN/cross-cloud)
 * - Appends pool_timeout=30 if not present (Prisma default 10s can exhaust under connection spikes)
 * - Appends socket_timeout=30 if not present
 */
export function getTunedDatabaseUrl(rawUrl?: string): string {
  const urlStr = (rawUrl || process.env.DATABASE_URL || '').trim();
  if (!urlStr) {
    return urlStr;
  }

  // Only tune MySQL connection strings
  if (!urlStr.startsWith('mysql://') && !urlStr.startsWith('mysql:')) {
    return urlStr;
  }

  try {
    const qIdx = urlStr.indexOf('?');
    const base = qIdx !== -1 ? urlStr.substring(0, qIdx) : urlStr;
    const queryString = qIdx !== -1 ? urlStr.substring(qIdx + 1) : '';
    const params = new URLSearchParams(queryString);

    // Apply resilient timeouts for cross-network/cloud connections
    if (!params.has('connect_timeout')) {
      params.set('connect_timeout', '30');
    }
    if (!params.has('pool_timeout')) {
      params.set('pool_timeout', '30');
    }
    if (!params.has('socket_timeout')) {
      params.set('socket_timeout', '30');
    }

    return `${base}?${params.toString()}`;
  } catch {
    return urlStr;
  }
}

/**
 * Instantiates the PrismaClient with tuned connection parameters and logging.
 */
function createPrismaClient(): PrismaClient {
  const tunedUrl = getTunedDatabaseUrl();

  const clientOptions: any = {
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  };

  if (tunedUrl) {
    clientOptions.datasources = {
      db: {
        url: tunedUrl,
      },
    };
  }

  return new PrismaClient(clientOptions);
}

// Global Singleton Initialization:
// We assign globalThis.__assetpulse_prisma unconditionally in BOTH development and production.
// In Next.js App Router production builds, different route chunks evaluate in isolation within
// the same Node process. An unconditional assignment prevents multiple PrismaClients and connection pools.
export const prisma =
  globalThis.__assetpulse_prisma ?? createPrismaClient();

globalThis.__assetpulse_prisma = prisma;

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

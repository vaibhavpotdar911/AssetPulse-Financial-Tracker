/**
 * Vitest Global Setup for AssetPulse
 */

import { afterAll } from 'vitest';

// Set default test environment variables
process.env.NODE_ENV = 'test';
process.env.APP_URL = process.env.APP_URL || 'http://localhost:3000';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./fintrack.db';
process.env.DB_TYPE = process.env.DB_TYPE || 'sqlite';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-32-chars-minimum!';
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'test-jwt-secret-key-32-chars-minimum!';

// Global teardown hook to avoid hanging prisma handles
afterAll(async () => {
  try {
    const { prisma } = await import('../src/lib/db');
    if (prisma) {
      await prisma.$disconnect();
    }
  } catch {
    // Ignored if db module was not imported in the test run
  }
});

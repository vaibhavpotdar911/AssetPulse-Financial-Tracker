/**
 * Database Verification & SQLite Inspection Helper
 * 
 * Inspects database files, table schema compliance, SQLite pragmas,
 * and environment toggle readiness for SQLite vs MySQL.
 */

import fs from 'node:fs';
import path from 'node:path';

export interface TableInspectionResult {
  exists: boolean;
  tableCount?: number;
  tables?: string[];
}

export class DbHelper {
  public projectRoot: string;
  public defaultDbPath: string;

  constructor(projectRoot: string = '/Users/vaibhavpotdar/Desktop/FinTrack') {
    this.projectRoot = projectRoot;
    this.defaultDbPath = path.join(projectRoot, 'prisma', 'fintrack.db');
    if (!fs.existsSync(this.defaultDbPath)) {
      // Fallback check root fintrack.db
      const rootDb = path.join(projectRoot, 'fintrack.db');
      if (fs.existsSync(rootDb)) {
        this.defaultDbPath = rootDb;
      }
    }
  }

  /**
   * Check if schema.prisma exists and inspect required models
   */
  public inspectPrismaSchema(): {
    exists: boolean;
    models: string[];
    hasUser: boolean;
    hasFixedDeposit: boolean;
    hasAuditLog: boolean;
    hasNotification: boolean;
    provider: string;
  } {
    const schemaPath = path.join(this.projectRoot, 'prisma', 'schema.prisma');
    if (!fs.existsSync(schemaPath)) {
      return {
        exists: false,
        models: [],
        hasUser: false,
        hasFixedDeposit: false,
        hasAuditLog: false,
        hasNotification: false,
        provider: 'none',
      };
    }

    const content = fs.readFileSync(schemaPath, 'utf8');
    const modelMatches = Array.from(content.matchAll(/model\s+(\w+)\s+\{/g)).map((m) => m[1]);
    const providerMatch = content.match(/provider\s*=\s*"(\w+)"/);

    return {
      exists: true,
      models: modelMatches,
      hasUser: modelMatches.includes('User'),
      hasFixedDeposit: modelMatches.includes('FixedDeposit'),
      hasAuditLog: modelMatches.includes('AuditLog'),
      hasNotification: modelMatches.includes('Notification'),
      provider: providerMatch ? providerMatch[1] : 'unknown',
    };
  }

  /**
   * Check if db-prep.js exists and inspect its dialect handling
   */
  public inspectDbPrepScript(): { exists: boolean; handlesSqlite: boolean; handlesMysql: boolean } {
    const scriptPath = path.join(this.projectRoot, 'scripts', 'db-prep.js');
    if (!fs.existsSync(scriptPath)) {
      return { exists: false, handlesSqlite: false, handlesMysql: false };
    }
    const content = fs.readFileSync(scriptPath, 'utf8');
    return {
      exists: true,
      handlesSqlite: content.includes('sqlite'),
      handlesMysql: content.includes('mysql'),
    };
  }

  /**
   * Check if seed script exists
   */
  public inspectSeedScript(): { exists: boolean; hasSampleDeposits: boolean } {
    const seedPath = path.join(this.projectRoot, 'prisma', 'seed.ts');
    if (!fs.existsSync(seedPath)) {
      return { exists: false, hasSampleDeposits: false };
    }
    const content = fs.readFileSync(seedPath, 'utf8');
    return {
      exists: true,
      hasSampleDeposits: content.includes('FixedDeposit') || content.includes('fixedDeposit') || content.includes('deposits'),
    };
  }
}

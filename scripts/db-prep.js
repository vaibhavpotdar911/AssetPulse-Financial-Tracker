#!/usr/bin/env node
/**
 * AssetPulse - Dynamic Database Provider Synchronizer
 * 
 * Inspects DATABASE_URL and DB_TYPE from the environment,
 * synchronizes prisma/schema.prisma datasource provider ("sqlite" | "mysql"),
 * adjusts provider-specific native type annotations (@db.Text),
 * and triggers `prisma generate` (and optionally `prisma db push`).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT_DIR, '.env');
const ENV_EXAMPLE_FILE = path.join(ROOT_DIR, '.env.example');
const SCHEMA_FILE = path.join(ROOT_DIR, 'prisma', 'schema.prisma');

// 1. Zero-dependency environment file parser & default fallback
function loadEnv() {
  if (fs.existsSync(ENV_FILE)) {
    const content = fs.readFileSync(ENV_FILE, 'utf-8');
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx !== -1) {
        const key = line.slice(0, eqIdx).trim();
        let val = line.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  } else if (fs.existsSync(ENV_EXAMPLE_FILE)) {
    console.log('[AssetPulse DB] No .env found. Copying .env.example -> .env');
    fs.copyFileSync(ENV_EXAMPLE_FILE, ENV_FILE);
    return loadEnv();
  } else {
    console.log('[AssetPulse DB] No .env found. Initializing zero-config SQLite .env');
    const defaultEnv = [
      '# AssetPulse Default Configuration',
      'NODE_ENV=development',
      'PORT=3000',
      'DATABASE_URL="file:./fintrack.db"',
      'DB_TYPE="sqlite"',
      'JWT_SECRET="assetpulse-super-secret-jwt-key-minimum-32-chars-long"',
      'NEXTAUTH_SECRET="assetpulse-super-secret-jwt-key-minimum-32-chars-long"',
    ].join('\n');
    fs.writeFileSync(ENV_FILE, defaultEnv, 'utf-8');
    return loadEnv();
  }
}

loadEnv();

// 2. Identify target provider dialect
const dbUrl = process.env.DATABASE_URL || 'file:./fintrack.db';
const dbType = (process.env.DB_TYPE || '').toLowerCase();

let targetProvider = 'sqlite';
if (dbType === 'mysql' || dbUrl.startsWith('mysql://') || dbUrl.startsWith('mysql:')) {
  targetProvider = 'mysql';
} else {
  targetProvider = 'sqlite';
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'file:./fintrack.db';
  }
}

console.log(`[AssetPulse DB] Active dialect: ${targetProvider.toUpperCase()}`);
console.log(`[AssetPulse DB] Target URL:    ${process.env.DATABASE_URL}`);

// 3. Synchronize prisma/schema.prisma
if (!fs.existsSync(SCHEMA_FILE)) {
  console.error(`[AssetPulse DB] Schema file missing at ${SCHEMA_FILE}`);
  process.exit(1);
}

let schema = fs.readFileSync(SCHEMA_FILE, 'utf-8');
const initialSchema = schema;

// Update datasource provider
schema = schema.replace(
  /provider\s*=\s*"(sqlite|mysql)"/,
  `provider = "${targetProvider}"`
);

// Adjust dialect-specific types
if (targetProvider === 'mysql') {
  // Ensure long text fields have @db.Text in MySQL to avoid 191 char truncation
  schema = schema.replace(/snapshotData\s+String(?!\s+@db\.Text)/g, 'snapshotData       String        @db.Text');
  schema = schema.replace(/notes\s+String\?(?!\s+@db\.Text)/g, 'notes              String?       @db.Text');
} else {
  // SQLite does not support @db.* annotations; strip them cleanly
  schema = schema.replace(/@db\.\w+(\([^)]*\))?/g, '');
}

if (schema !== initialSchema) {
  fs.writeFileSync(SCHEMA_FILE, schema, 'utf-8');
  console.log(`[AssetPulse DB] Synchronized prisma/schema.prisma for provider "${targetProvider}"`);
} else {
  console.log(`[AssetPulse DB] prisma/schema.prisma already synchronized for "${targetProvider}"`);
}

// 4. Run `prisma generate`
try {
  console.log('[AssetPulse DB] Generating Prisma Client (npx prisma generate)...');
  execSync('npx prisma generate', {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: { ...process.env, NPM_CONFIG_CACHE: '/tmp/npm-cache' },
  });
  console.log('[AssetPulse DB] Prisma Client generated successfully.');
} catch (err) {
  console.error('[AssetPulse DB] Prisma generate failed:', err.message);
  process.exit(1);
}

// 5. Optional DB push flag (--push)
if (process.argv.includes('--push')) {
  try {
    console.log('[AssetPulse DB] Pushing schema to database (npx prisma db push --skip-generate)...');
    const forceReset = process.env.DB_FORCE_RESET === 'true' || process.argv.includes('--force-reset');
    const acceptDataLoss = process.env.DB_ACCEPT_DATA_LOSS === 'true' || process.argv.includes('--accept-data-loss');

    let pushCmd = 'npx prisma db push --skip-generate';
    if (forceReset) {
      pushCmd += ' --force-reset';
    } else if (acceptDataLoss) {
      pushCmd += ' --accept-data-loss';
    }

    execSync(pushCmd, {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      env: { ...process.env, NPM_CONFIG_CACHE: '/tmp/npm-cache' },
    });
    console.log('[AssetPulse DB] Database schema push succeeded.');
  } catch (err) {
    console.error('[AssetPulse DB] Database push failed:', err.message);
    process.exit(1);
  }
}

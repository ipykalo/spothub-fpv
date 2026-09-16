#!/usr/bin/env node
// Prepares a separate test database and bucket, then runs the API's e2e
// suite against them. See apps/api/e2e/README.md for what that suite covers
// and why it needs real infrastructure rather than mocks.
//
// Pure Node, deliberately: the rest of this repo's operational scripts
// (prisma/seed.ts aside) lean on shell one-liners, which is exactly what
// broke earlier this session on Windows (`||true`, `psql -c`, quoting). A
// script every platform runs the same way is worth the extra lines here.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { S3Client, CreateBucketCommand } from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

loadDotEnvWithoutOverriding(join(ROOT, '.env'));

const baseDatabaseUrl = requireEnv('DATABASE_URL');
const baseBucket = requireEnv('S3_BUCKET');

const testDatabaseUrl = withTestDatabaseName(baseDatabaseUrl);
const testBucket = `${baseBucket}-test`;

process.env.DATABASE_URL = testDatabaseUrl;
process.env.S3_BUCKET = testBucket;
process.env.NODE_ENV = 'test';

await ensureDatabase(testDatabaseUrl);
deployMigrations(testDatabaseUrl);
await ensureBucket(testBucket);

console.log(
  `\nRunning e2e suite against ${maskPassword(testDatabaseUrl)} / bucket "${testBucket}"\n`,
);

const extraArgs = process.argv.slice(2);
const vitest = spawnSync(
  binPath('vitest'),
  // The config roots the run at the repository and picks the e2e specs out of
  // it, so coverage is measured over `apps/api/src` — the code this suite
  // exists to exercise — rather than over the suite itself.
  ['run', '--config', 'apps/api/e2e/vitest.config.ts', ...extraArgs],
  // Windows cannot exec a .cmd shim without a shell; a shell on POSIX just
  // runs the same command through /bin/sh -c, harmlessly.
  { cwd: ROOT, env: process.env, stdio: 'inherit', shell: true },
);

if (vitest.error) {
  throw vitest.error;
}

process.exit(vitest.status ?? 1);

// ---------------------------------------------------------------------------

/** dotenv's own rule: a variable already in the environment is never overridden. */
function loadDotEnvWithoutOverriding(path) {
  if (!existsSync(path)) {
    return;
  }

  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);

    if (!match || line.trim().startsWith('#')) {
      continue;
    }

    const [, key, rawValue] = match;

    if (process.env[key] === undefined) {
      process.env[key] = rawValue.replace(/^["']|["']$/g, '');
    }
  }
}

function requireEnv(key) {
  const value = process.env[key];

  if (!value) {
    throw new Error(`${key} is not set — copy .env.example to .env and fill it in first`);
  }

  return value;
}

/** `.../fpv?schema=public` -> `.../fpv_test?schema=public`, whatever the database is called. */
function withTestDatabaseName(url) {
  const parsed = new URL(url);
  const name = parsed.pathname.replace(/^\//, '');

  if (name.endsWith('_test')) {
    return url;
  }

  parsed.pathname = `/${name}_test`;
  return parsed.toString();
}

/** Every Postgres server has this database; it is what "create the real one" connects through. */
function maintenanceUrl(url) {
  const parsed = new URL(url);
  parsed.pathname = '/postgres';
  return parsed.toString();
}

async function ensureDatabase(url) {
  const name = new URL(url).pathname.replace(/^\//, '');
  const admin = new PrismaClient({ datasources: { db: { url: maintenanceUrl(url) } } });

  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    console.log(`Created database "${name}"`);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('already exists')) {
      throw error;
    }
  } finally {
    await admin.$disconnect();
  }
}

function deployMigrations(url) {
  const result = spawnSync(binPath('prisma'), ['migrate', 'deploy'], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
    shell: true,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function ensureBucket(bucket) {
  const client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') !== 'false',
    credentials: {
      accessKeyId: requireEnv('S3_ACCESS_KEY'),
      secretAccessKey: requireEnv('S3_SECRET_KEY'),
    },
  });

  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`Created bucket "${bucket}"`);
  } catch (error) {
    const name = error && typeof error === 'object' ? error.name : undefined;

    if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') {
      throw error;
    }
  } finally {
    client.destroy();
  }
}

function binPath(name) {
  const shim = process.platform === 'win32' ? `${name}.cmd` : name;
  return join(ROOT, 'node_modules', '.bin', shim);
}

function maskPassword(url) {
  const parsed = new URL(url);

  if (parsed.password) {
    parsed.password = '***';
  }

  return parsed.toString();
}

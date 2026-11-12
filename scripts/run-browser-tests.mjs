/**
 * Runs the browser journeys (`apps/browser-e2e`) against the stack that ships.
 *
 * Brings up `deploy/docker-compose.yml` — Caddy, the API and client images,
 * Postgres and MinIO — as its own compose project with throwaway settings,
 * waits for it, runs Playwright, and takes the stack and its volumes down
 * again whatever happened. Nothing here touches the development database or
 * the dry run's stack.
 *
 * Usage, from the repository root (Docker running, ports 80 and 443 free):
 *   npm run test:browser                 builds both images, then runs
 *   npm run test:browser -- --skip-build uses images already tagged `browser`
 *   npm run test:browser -- --keep       leaves the stack up afterwards
 *   npm run test:browser -- -- --project=desktop   anything after `--` goes to Playwright
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const split = argv.indexOf('--');
const own = split === -1 ? argv : argv.slice(0, split);
const passThrough = split === -1 ? [] : argv.slice(split + 1);

const skipBuild = own.includes('--skip-build');
const keep = own.includes('--keep');

const TAG = 'browser';
const PROJECT = 'spothub-browser';
const envFile = resolve('deploy/.env.browser');
const compose = ['compose', '-p', PROJECT, '--env-file', envFile];

/** Throwaway settings, never secrets: this stack lives for one run. */
const SETTINGS = {
  SITE_DOMAIN: 'localhost',
  STORAGE_DOMAIN: 'storage.localhost',
  POSTGRES_PASSWORD: 'browser-test-only',
  JWT_ACCESS_SECRET: 'browser-test-only-access-secret-of-32-chars',
  JWT_REFRESH_SECRET: 'browser-test-only-refresh-secret-of-32-chars',
  S3_ACCESS_KEY: 'browsertestkey',
  S3_SECRET_KEY: 'browsertestsecret123',
  ALLOWED_EMAILS: 'nobody@example.invalid',
  GOOGLE_CLIENT_ID: 'unused-in-browser-tests',
  GOOGLE_CLIENT_SECRET: 'unused-in-browser-tests',
  SPOTHUB_TAG: TAG,
};

function writeEnv() {
  const lines = readFileSync('deploy/.env.example', 'utf8')
    .split(/\r?\n/)
    .filter((line) => !Object.keys(SETTINGS).some((key) => line.startsWith(`${key}=`)));

  for (const [key, value] of Object.entries(SETTINGS)) {
    lines.push(`${key}=${value}`);
  }
  writeFileSync(envFile, `${lines.join('\n')}\n`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.slice(0, 3).join(' ')} … exited with ${String(result.status)}`,
    );
  }
}

function dockerCompose(...args) {
  run('docker', [...compose, ...args], { cwd: 'deploy' });
}

function buildImages() {
  for (const app of ['api', 'client']) {
    console.log(`== Building the ${app} image`);
    run('docker', [
      'build',
      '-q',
      '-f',
      `apps/${app}/Dockerfile`,
      '-t',
      `ghcr.io/ipykalo/spothub-fpv/${app}:${TAG}`,
      '.',
    ]);
  }
}

/**
 * Ready once Caddy can reach both the API (healthy, with its database) and
 * the client. Asked from inside the Caddy container over the stack's own
 * network, so no certificate is involved.
 */
async function waitForStack() {
  const probe = (url) => {
    try {
      return execFileSync(
        'docker',
        // As the site's own host: the client refuses any other Host header
        // (NG_ALLOWED_HOSTS), so `client:4000` alone would never answer.
        [
          ...compose,
          'exec',
          '-T',
          'caddy',
          'wget',
          '-qO-',
          '--header',
          'Host: localhost',
          url,
        ],
        { cwd: 'deploy', encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      );
    } catch {
      return '';
    }
  };

  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (
      probe('http://api:3000/api/health').includes('"status":"ok"') &&
      probe('http://client:4000/about')
    ) {
      return;
    }
    await new Promise((done) => setTimeout(done, 2000));
  }
  throw new Error('the stack did not come up within three minutes');
}

let failed = false;

try {
  writeEnv();
  if (!skipBuild) {
    buildImages();
  }

  console.log(`== Starting the stack (${PROJECT})`);
  dockerCompose('up', '-d', '--quiet-pull');
  await waitForStack();

  console.log('== Running the journeys');
  run(
    'npx',
    ['playwright', 'test', '-c', 'apps/browser-e2e/playwright.config.ts', ...passThrough],
    {
      shell: process.platform === 'win32',
      env: { ...process.env, BROWSER_E2E_ENV: envFile, BROWSER_E2E_PROJECT: PROJECT },
    },
  );
} catch (error) {
  failed = true;
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
} finally {
  if (keep) {
    console.log(
      `== Left running: docker ${compose.join(' ')} down -v (from deploy/) removes it`,
    );
  } else {
    console.log('== Taking the stack down');
    try {
      dockerCompose('down', '-v', '--remove-orphans');
    } catch {
      console.error('could not take the stack down; see `docker compose ls`');
    }
    rmSync(envFile, { force: true });
  }
}

process.exit(failed ? 1 : 0);

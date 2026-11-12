import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import jwt from 'jsonwebtoken';

/**
 * The stack the journeys run against, as `scripts/run-browser-tests.mjs`
 * brought it up: its compose project and the env file it was given. Read
 * here so a journey can reach the database the way an operator would.
 */
const envFile = resolve(process.env['BROWSER_E2E_ENV'] ?? 'deploy/.env.browser');
const project = process.env['BROWSER_E2E_PROJECT'] ?? 'spothub-browser';

function readEnv(path: string): Map<string, string> {
  const values = new Map<string, string>();

  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());

    if (match) {
      values.set(match[1], match[2]);
    }
  }

  return values;
}

const env = readEnv(envFile);

function setting(name: string): string {
  const value = env.get(name);

  if (!value) {
    throw new Error(`${name} is not set in ${envFile}`);
  }
  return value;
}

/** One statement against the stack's database, as its own user. */
export function psql(sql: string): string {
  return execFileSync(
    'docker',
    [
      'compose',
      '-p',
      project,
      '--env-file',
      envFile,
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      setting('POSTGRES_USER'),
      '-d',
      setting('POSTGRES_DB'),
      '-qtAX',
      '-c',
      sql,
    ],
    { cwd: resolve('deploy'), encoding: 'utf8' },
  ).trim();
}

export interface Pilot {
  readonly id: string;
  readonly email: string;
  /** An access token the API accepts, signed with the stack's own secret. */
  readonly token: string;
}

/**
 * A pilot of its own for a run. Signing in needs Google, which a test stack
 * cannot reach, so the row is inserted and given a token signed with the
 * secret the API verifies with — what the OAuth callback would have handed
 * the browser. `removePilot` takes everything it owns with it.
 */
export function createPilot(): Pilot {
  const id = randomUUID();
  const email = `browser-e2e-${id}@example.invalid`;

  psql(
    `INSERT INTO users (id, email, display_name, pilot_name, role, created_at, updated_at)
     VALUES ('${id}', '${email}', 'Browser Journeys', 'Journey Pilot', 'USER', now(), now());`,
  );

  const token = jwt.sign({ sub: id, email, role: 'USER' }, setting('JWT_ACCESS_SECRET'), {
    expiresIn: '30m',
  });

  return { id, email, token };
}

/** Every row the pilot owns goes with it, by the schema's own cascades. */
export function removePilot(pilot: Pilot): void {
  psql(`DELETE FROM users WHERE id = '${pilot.id}';`);
}

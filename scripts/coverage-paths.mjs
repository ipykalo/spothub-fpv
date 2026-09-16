import { fileURLToPath } from 'node:url';

/**
 * What coverage counts, shared by every suite that measures it.
 *
 * The same lists feed the API's unit and e2e configs and the client's, so the
 * runs can be added together file by file; `scripts/coverage.mjs` then sorts
 * the files into areas and holds each to its floor.
 *
 * Every suite is rooted at the repository rather than at itself, so one path
 * means the same thing everywhere — and so a suite can count the shared
 * library it loads from outside its own folder.
 */

/**
 * The repository root as an absolute path, worked out from the config file
 * that asks. A relative `root` would be resolved against the working
 * directory, which is not where a config lives.
 */
export function repoRootFrom(configUrl, upwards) {
  return fileURLToPath(new URL(upwards, configUrl));
}

export const API_COVERAGE_INCLUDE = ['apps/api/src/**/*.ts', 'libs/shared/src/**/*.ts'];

export const CLIENT_COVERAGE_INCLUDE = [
  'apps/client/src/**/*.ts',
  'libs/shared/src/**/*.ts',
];

/**
 * Files whose coverage says nothing about whether the code works.
 *
 * A Nest module is dependency wiring the app fails to start without; a barrel
 * is a list of exports; an entity is a shape with no behaviour. Counting them
 * moves the number without moving the risk — and invites tests written to
 * move the number.
 */
export const COVERAGE_EXCLUDE = [
  '**/*.spec.ts',
  '**/__fixtures__/**',
  '**/index.ts',
  '**/*.module.ts',
  '**/*.entity.ts',
  '**/*.tokens.ts',
  '**/abstract/**',
  '**/main.ts',
  '**/main.server.ts',
  '**/app.config*.ts',
  '**/*.routes*.ts',
  '**/environment*.ts',
];

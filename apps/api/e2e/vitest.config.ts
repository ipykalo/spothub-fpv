import { defineConfig } from 'vitest/config';

import {
  API_COVERAGE_INCLUDE,
  COVERAGE_EXCLUDE,
  repoRootFrom,
} from '../../../scripts/coverage-paths.mjs';

/**
 * The e2e suite lives outside `apps/api/src`, so it has its own config: it
 * needs `@spothub/shared` resolved through the tsconfig paths, one test file
 * at a time, and a longer timeout than a unit test ever wants.
 *
 * One file at a time because each boots a full app with its own real job-queue
 * worker polling the same Postgres table, and interleaving that with another
 * file's setup is not worth the risk for a suite this small. See `../README.md`.
 *
 * Rooted at the repository, as the unit suite is, so coverage measures
 * `apps/api/src` — the code this suite exists to exercise — and the two runs
 * add together.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    root: repoRootFrom(import.meta.url, '../../..'),
    environment: 'node',
    include: ['apps/api/e2e/**/*.e2e.spec.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json'],
      reportsDirectory: 'coverage/api-e2e',
      include: API_COVERAGE_INCLUDE,
      exclude: COVERAGE_EXCLUDE,
    },
  },
});

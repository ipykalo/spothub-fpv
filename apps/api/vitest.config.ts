import { defineConfig } from 'vitest/config';

import {
  API_COVERAGE_INCLUDE,
  COVERAGE_EXCLUDE,
  repoRootFrom,
} from '../../scripts/coverage-paths.mjs';

/**
 * The API's unit suite: the pure parsers and planners under `src`, which touch
 * no database, no storage and no network.
 *
 * The e2e suite sits beside it with its own config and its own command
 * (`e2e/vitest.config.ts`), because it needs a real Postgres and a real MinIO.
 * Both run from the repository root and measure the same files, so the two
 * runs add together — `npm run coverage` does that and holds each area to its
 * floor.
 */
export default defineConfig({
  test: {
    root: repoRootFrom(import.meta.url, '../..'),
    environment: 'node',
    include: ['apps/api/src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json'],
      reportsDirectory: 'coverage/api-unit',
      include: API_COVERAGE_INCLUDE,
      exclude: COVERAGE_EXCLUDE,
    },
  },
});

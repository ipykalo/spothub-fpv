import { defineConfig } from 'vitest/config';

import {
  CLIENT_COVERAGE_INCLUDE,
  COVERAGE_EXCLUDE,
  repoRootFrom,
} from '../../scripts/coverage-paths.mjs';

/**
 * The client's unit suite: logic, not UI.
 *
 * Plain vitest in a Node environment rather than Angular's `unit-test`
 * builder, which boots a TestBed and a DOM for every file. What is worth
 * testing here needs neither — the stores are signals and the helpers are
 * pure — and the production build already catches a template that reads a
 * property no longer there, which is what a component test would mostly be
 * doing. (The builder also does not currently start under vitest 4: its
 * TestBed init fails before a single test runs.)
 *
 * Rooted at the repository like the API's suites, so coverage from all three
 * adds together in `npm run coverage`.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    root: repoRootFrom(import.meta.url, '../..'),
    environment: 'node',
    include: ['apps/client/src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json'],
      reportsDirectory: 'coverage/client',
      include: CLIENT_COVERAGE_INCLUDE,
      exclude: COVERAGE_EXCLUDE,
    },
  },
});

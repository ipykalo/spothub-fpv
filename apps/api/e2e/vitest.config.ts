import { defineConfig } from 'vitest/config';

/**
 * The e2e suite lives outside `apps/api/src`, so it needs an explicit
 * config — the plain `vitest run --root apps/api` the unit suite uses has no
 * config of its own and resolves `@spothub/shared` through machinery that is
 * scoped to that root; this reproduces it for `apps/api/e2e` instead of
 * relying on whatever gave the unit suite that for free.
 *
 * Tests run one file at a time: each boots a full app with its own real
 * job-queue worker polling the same Postgres table, and interleaving that
 * with another test file's setup is not worth the risk for a suite this
 * small. See `../README.md`.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30_000,
  },
});

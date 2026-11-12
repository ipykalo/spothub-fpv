import { defineConfig, devices } from '@playwright/test';

/**
 * Browser journeys: what a pilot does, in a real browser, against the images
 * that ship — the `deploy/` stack behind Caddy, brought up by
 * `scripts/run-browser-tests.mjs`. Not component tests, and no screenshots to
 * compare: each journey fails on what a pilot would notice, and on any
 * console error or Content-Security-Policy violation (`support/fixtures.ts`).
 *
 * One worker, so the journeys share one pilot and run in a known order of
 * nothing — each seeds what it needs. Run with `npm run test:browser`.
 */
export default defineConfig({
  testDir: './journeys',
  outputDir: '../../dist/browser-e2e/results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: '../../dist/browser-e2e/report', open: 'never' }],
  ],
  use: {
    baseURL: process.env['BROWSER_E2E_SITE'] ?? 'https://localhost',
    // Caddy signs `localhost` and `storage.localhost` with an authority of its
    // own for the test stack. The browser alone is told to accept it; nothing
    // here reaches a real site.
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});

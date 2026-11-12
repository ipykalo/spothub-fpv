import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { create, expect, test } from '../support/fixtures';

/** A real radio log, from the parser's own fixtures: an Air65, flown 14 Sep 2026. */
const LOG = 'Air65-2026-09-14-183210.csv';
const LOG_PATH = resolve('apps/api/src/flight-logs/formats/edgetx/__fixtures__', LOG);

test('a radio log imports, and its flight lands in the logbook', async ({
  api,
  page,
  signIn,
}) => {
  // The build named like the radio model is where a log's flights go.
  await create(api, '/api/builds', { name: 'Air65' });

  await signIn('/flights');
  await page.getByRole('button', { name: /Import logs/ }).click();

  // Hashed in the browser, sent straight to storage, parsed by a background
  // job the page polls — then the logbook reloads.
  await page
    .locator('sh-log-import-panel input[type="file"][accept*=".csv"]')
    .setInputFiles({ name: LOG, mimeType: 'text/csv', buffer: readFileSync(LOG_PATH) });

  await expect(page.getByText(/Sep 14, 2026/).first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText('Air65').first()).toBeVisible();

  // The logbook really holds it: a session with the log's flights in it.
  const sessions = (await (await api.get('/api/flights/sessions')).json()) as {
    flights: unknown[];
  }[];
  expect(sessions.flatMap((session) => session.flights).length).toBeGreaterThan(0);
});

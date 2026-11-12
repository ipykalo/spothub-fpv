import {
  type APIRequestContext,
  type ConsoleMessage,
  test as base,
  expect,
} from '@playwright/test';

import { type Pilot, createPilot, removePilot } from './stack';

/**
 * A console error that is the app working as designed, not a fault: a public
 * page asks whether its reader is signed in, and a visitor's answer is 401.
 * The browser logs every failed request as an error, so this one is let
 * through — by its address, not by its words.
 */
function expected(message: ConsoleMessage): boolean {
  return (
    message.text().startsWith('Failed to load resource') &&
    message.location().url.endsWith('/api/auth/refresh')
  );
}

interface JourneyFixtures {
  /** What went wrong in the browser during the test; must end empty. */
  problems: string[];
  /** The API, as the pilot: for seeding what a journey starts from. */
  api: APIRequestContext;
  /** Signs the pilot in and lands on `path`, as Google's callback would. */
  signIn: (path: string) => Promise<void>;
}

export const test = base.extend<JourneyFixtures, { pilot: Pilot }>({
  pilot: [
    // Playwright reads a fixture's dependencies from its first parameter's
    // destructuring, so a fixture that needs none must still write `{}`.
    async ({}, use) => {
      const pilot = createPilot();
      await use(pilot);
      removePilot(pilot);
    },
    { scope: 'worker' },
  ],

  problems: [
    async ({ page }, use) => {
      const problems: string[] = [];

      // Chrome logs a policy violation as a console error too, but this names
      // the directive and the address, which is what fixing one needs.
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (event) => {
          const where = event.sourceFile
            ? ` in ${event.sourceFile}:${String(event.lineNumber)}`
            : '';
          console.error(
            `CSP violation: ${event.effectiveDirective} refused ${event.blockedURI}${where}`,
          );
        });
      });

      page.on('console', (message) => {
        if (message.type() === 'error' && !expected(message)) {
          problems.push(`console: ${message.text()} (${message.location().url})`);
        }
      });
      page.on('pageerror', (error) => {
        problems.push(`page error: ${error.message}`);
      });

      await use(problems);

      if (problems.length > 0) {
        throw new Error(`The browser reported problems:\n${problems.join('\n')}`);
      }
    },
    { auto: true },
  ],

  api: async ({ playwright, pilot, baseURL }, use) => {
    const api = await playwright.request.newContext({
      baseURL,
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: { Authorization: `Bearer ${pilot.token}` },
    });
    await use(api);
    await api.dispose();
  },

  signIn: async ({ page, pilot }, use) => {
    await use(async (path) => {
      await page.addInitScript((target) => {
        sessionStorage.setItem('spothub:returnUrl', target);
      }, path);
      await page.goto(`/auth/callback#access_token=${pilot.token}`);
      await page.waitForURL((url) => url.pathname === path.split('?')[0]);
    });
  },
});

export { expect };

/** Creates through the API and answers its JSON, failing on anything but 2xx. */
export async function create<T>(
  api: APIRequestContext,
  path: string,
  data: object,
): Promise<T> {
  const response = await api.post(path, { data });

  expect(response.ok(), `POST ${path}: ${String(response.status())}`).toBe(true);
  return (await response.json()) as T;
}

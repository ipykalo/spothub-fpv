import { InjectionToken } from '@angular/core';

/**
 * The API base URL, injected rather than imported from an environment file so
 * tests can supply their own and the value has one obvious source.
 *
 * Relative on both sides on purpose. The browser resolves it against the site;
 * on the server, requests are keyed by this URL when their responses are handed
 * to the browser, so the browser finds them under the same `/api/...` it asks
 * for and does not fetch the page's data a second time.
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => '/api',
});

/**
 * Where the rendering server reaches the API, e.g. `http://api:3000`. Provided
 * only in the server config; absent in the browser.
 */
export const SERVER_API_ORIGIN = new InjectionToken<string>('SERVER_API_ORIGIN');

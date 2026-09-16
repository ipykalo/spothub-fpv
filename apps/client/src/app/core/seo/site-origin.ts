import { DOCUMENT, InjectionToken, REQUEST, inject } from '@angular/core';

/**
 * Where this page lives, as an absolute origin — `https://example.com`.
 *
 * A canonical link, an `og:url` and a sitemap entry all have to be absolute,
 * and only the site itself knows its address. In the browser that is simply
 * where the page was loaded from; on the server it is taken from the request
 * being rendered, so nothing has to be configured for the domain. Angular
 * refuses a request whose Host header is not allowed (`NG_ALLOWED_HOSTS`),
 * which is what keeps a forged one out of these tags.
 */
export const SITE_ORIGIN = new InjectionToken<string>('SITE_ORIGIN', {
  providedIn: 'root',
  factory: () => {
    const request = inject(REQUEST, { optional: true });

    if (request) {
      return new URL(request.url).origin;
    }

    return inject(DOCUMENT).location.origin;
  },
});

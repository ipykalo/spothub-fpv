import type { HttpEvent, HttpHandlerFn, HttpRequest } from '@angular/common/http';
import { REQUEST, inject } from '@angular/core';
import type { Observable } from 'rxjs';

import { SERVER_API_ORIGIN } from './api.tokens';

/**
 * On the server only, sends API calls straight to the API.
 *
 * Registered in `app.config.server.ts` behind the response cache, which has
 * already keyed the request by its `/api/...` URL. By the time a request gets
 * here Angular's server platform may also have made that URL absolute against
 * the page's own address — the public site, which the rendering server should
 * not have to reach. Both forms are rewritten onto `SERVER_API_ORIGIN`.
 *
 * The visitor's address goes along with it. Caddy hands the rendering server
 * the address it saw, and the API — which trusts one proxy hop — counts its
 * rate limits by it. Without it, every visitor's page would be counted as the
 * rendering server's own, and one busy crawler would turn the blog away for
 * everybody.
 */
export function serverApiInterceptor(
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> {
  const origin = inject(SERVER_API_ORIGIN, { optional: true });

  if (origin === null) {
    return next(request);
  }

  const url = new URL(request.url, 'http://relative.invalid');

  if (!url.pathname.startsWith('/api/')) {
    return next(request);
  }

  const forwardedFor = inject(REQUEST, { optional: true })?.headers.get(
    'x-forwarded-for',
  );

  return next(
    request.clone({
      url: `${origin}${url.pathname}${url.search}`,
      ...(forwardedFor ? { setHeaders: { 'X-Forwarded-For': forwardedFor } } : {}),
    }),
  );
}

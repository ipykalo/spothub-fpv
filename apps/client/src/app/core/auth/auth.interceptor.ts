import {
  HttpErrorResponse,
  type HttpEvent,
  type HttpHandlerFn,
  type HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { type Observable, catchError, from, switchMap, throwError } from 'rxjs';

import { API_BASE_URL } from '../api/api.tokens';
import { AuthStore } from './auth.store';

/** Endpoints that must not trigger a refresh — refreshing on these would loop. */
const NO_RETRY = ['/auth/refresh', '/auth/logout'];

/**
 * Attaches the bearer token and recovers from expiry.
 *
 * On a 401 it refreshes once and replays the request. AuthStore de-duplicates
 * concurrent refreshes, so a burst of expired requests causes one round trip.
 */
export function authInterceptor(
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> {
  const auth = inject(AuthStore);
  const baseUrl = inject(API_BASE_URL);

  const isApiCall = request.url.startsWith(baseUrl);
  const isRetryable = isApiCall && !NO_RETRY.some((path) => request.url.includes(path));

  // Only our own API gets the token. A presigned upload goes straight to
  // object storage, which carries its signature in the query string and
  // rejects a request that also sends an Authorization header — and there is
  // no reason to hand our bearer token to another host in any case.
  if (!isApiCall) {
    return next(request);
  }

  return next(withToken(request, auth.token())).pipe(
    catchError((error: unknown) => {
      if (!isRetryable || !isUnauthorized(error)) {
        return throwError(() => error);
      }

      return from(auth.refresh()).pipe(
        switchMap((refreshed) =>
          refreshed ? next(withToken(request, auth.token())) : throwError(() => error),
        ),
      );
    }),
  );
}

function withToken(
  request: HttpRequest<unknown>,
  token: string | null,
): HttpRequest<unknown> {
  return token
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 401;
}

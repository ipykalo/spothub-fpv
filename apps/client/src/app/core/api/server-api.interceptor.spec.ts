import { HttpRequest, type HttpEvent, type HttpHandlerFn } from '@angular/common/http';
import { Injector, REQUEST, runInInjectionContext } from '@angular/core';
import { type Observable, of } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { SERVER_API_ORIGIN } from './api.tokens';
import { serverApiInterceptor } from './server-api.interceptor';

/** Runs the interceptor and answers with the request it passed on. */
function intercept(
  url: string,
  options: { origin?: string; visitor?: Request },
): HttpRequest<unknown> {
  const injector = Injector.create({
    providers: [
      ...(options.origin
        ? [{ provide: SERVER_API_ORIGIN, useValue: options.origin }]
        : []),
      ...(options.visitor ? [{ provide: REQUEST, useValue: options.visitor }] : []),
    ],
  });
  let passedOn: HttpRequest<unknown> | undefined;
  const next: HttpHandlerFn = (request): Observable<HttpEvent<unknown>> => {
    passedOn = request;
    return of();
  };

  runInInjectionContext(injector, () => {
    serverApiInterceptor(new HttpRequest('GET', url), next).subscribe();
  });

  if (!passedOn) {
    throw new Error('the interceptor passed nothing on');
  }
  return passedOn;
}

const visitor = (forwardedFor?: string): Request =>
  new Request('https://spothub.example/', {
    headers: forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {},
  });

describe('serverApiInterceptor', () => {
  it('sends an API call straight to the API, relative or made absolute', () => {
    const origin = 'http://api:3000';

    expect(intercept('/api/posts?page=2', { origin }).url).toBe(
      'http://api:3000/api/posts?page=2',
    );
    expect(intercept('https://spothub.example/api/posts', { origin }).url).toBe(
      'http://api:3000/api/posts',
    );
  });

  it('carries the visitor’s address, so the API counts its limits by it', () => {
    const passedOn = intercept('/api/posts', {
      origin: 'http://api:3000',
      visitor: visitor('203.0.113.5'),
    });

    expect(passedOn.headers.get('X-Forwarded-For')).toBe('203.0.113.5');
  });

  it('adds no address it was not given', () => {
    const passedOn = intercept('/api/posts', {
      origin: 'http://api:3000',
      visitor: visitor(),
    });

    expect(passedOn.headers.has('X-Forwarded-For')).toBe(false);
  });

  it('leaves everything alone in the browser and off the API', () => {
    expect(intercept('/api/posts', {}).url).toBe('/api/posts');
    expect(intercept('/assets/logo.svg', { origin: 'http://api:3000' }).url).toBe(
      '/assets/logo.svg',
    );
  });
});

import {
  HttpErrorResponse,
  type HttpEvent,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { type Observable, firstValueFrom, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { API_BASE_URL } from '../api/api.tokens';
import { AuthStore } from './auth.store';
import { authInterceptor } from './auth.interceptor';

/**
 * The bearer token, and recovering from its expiry.
 *
 * Three rules carry weight. Only our own API gets the token: a presigned
 * upload goes straight to object storage, which rejects a request carrying an
 * Authorization header — and there is no reason to hand a bearer token to
 * another host in any case. A 401 is retried once, after a refresh. And the
 * refresh call itself is never retried, or a dead session would loop forever.
 */
describe('authInterceptor', () => {
  const BASE = '/api';

  class FakeAuth {
    current: string | null = 'token-1';
    refreshes = 0;
    refreshSucceeds = true;

    token(): string | null {
      return this.current;
    }

    refresh(): Promise<boolean> {
      this.refreshes += 1;

      if (this.refreshSucceeds) {
        this.current = 'token-2';
      }

      return Promise.resolve(this.refreshSucceeds);
    }
  }

  /** Stands in for the rest of the chain, recording what it was handed. */
  class FakeChain {
    seen: HttpRequest<unknown>[] = [];
    /** How many of the first calls answer 401 before one succeeds. */
    unauthorizedCalls = 0;

    handle = (request: HttpRequest<unknown>): Observable<HttpEvent<unknown>> => {
      this.seen.push(request);

      if (this.seen.length <= this.unauthorizedCalls) {
        return throwError(() => new HttpErrorResponse({ status: 401, url: request.url }));
      }

      return of(new HttpResponse({ status: 200, url: request.url }));
    };
  }

  let auth: FakeAuth;
  let chain: FakeChain;
  let injector: Injector;

  beforeEach(() => {
    auth = new FakeAuth();
    chain = new FakeChain();
    injector = Injector.create({
      providers: [
        { provide: AuthStore, useValue: auth },
        { provide: API_BASE_URL, useValue: BASE },
      ],
    });
  });

  const send = (url: string): Promise<HttpEvent<unknown>> =>
    runInInjectionContext(injector, () =>
      firstValueFrom(authInterceptor(new HttpRequest('GET', url), chain.handle)),
    );

  const authorization = (at: number): string | null =>
    chain.seen[at].headers.get('Authorization');

  describe('who gets the token', () => {
    it('our own API does', async () => {
      await send('/api/builds');

      expect(authorization(0)).toBe('Bearer token-1');
    });

    it('object storage does not: a presigned PUT is rejected if it carries one', async () => {
      await send('https://storage.invalid/bucket/key?X-Amz-Signature=abc');

      expect(authorization(0)).toBeNull();
    });

    it('nobody does before anyone has signed in', async () => {
      auth.current = null;

      await send('/api/posts/published');

      expect(authorization(0)).toBeNull();
    });
  });

  describe('when the token has expired', () => {
    it('refreshes once and sends the request again with the new token', async () => {
      chain.unauthorizedCalls = 1;

      const answer = await send('/api/builds');

      expect(auth.refreshes).toBe(1);
      expect(chain.seen).toHaveLength(2);
      expect(authorization(1)).toBe('Bearer token-2');
      expect((answer as HttpResponse<unknown>).status).toBe(200);
    });

    it('gives up with the original failure when there is no session left', async () => {
      chain.unauthorizedCalls = 1;
      auth.refreshSucceeds = false;

      await expect(send('/api/builds')).rejects.toMatchObject({ status: 401 });
      expect(chain.seen).toHaveLength(1);
    });

    it('retries only once: a second 401 is the answer, not another refresh', async () => {
      chain.unauthorizedCalls = 2;

      await expect(send('/api/builds')).rejects.toMatchObject({ status: 401 });
      expect(auth.refreshes).toBe(1);
      expect(chain.seen).toHaveLength(2);
    });
  });

  describe('what is never retried', () => {
    it('is the refresh call itself, which would otherwise loop', async () => {
      chain.unauthorizedCalls = 1;

      await expect(send('/api/auth/refresh')).rejects.toMatchObject({ status: 401 });
      expect(auth.refreshes).toBe(0);
    });

    it('is signing out, for the same reason', async () => {
      chain.unauthorizedCalls = 1;

      await expect(send('/api/auth/logout')).rejects.toMatchObject({ status: 401 });
      expect(auth.refreshes).toBe(0);
    });

    it('is a failure that is not about the token', async () => {
      const failing = (request: HttpRequest<unknown>): Observable<HttpEvent<unknown>> =>
        throwError(() => new HttpErrorResponse({ status: 500, url: request.url }));

      await expect(
        runInInjectionContext(injector, () =>
          firstValueFrom(authInterceptor(new HttpRequest('GET', '/api/builds'), failing)),
        ),
      ).rejects.toMatchObject({ status: 500 });
      expect(auth.refreshes).toBe(0);
    });

    it('is a request to another host, however it fails', async () => {
      chain.unauthorizedCalls = 1;

      await expect(send('https://storage.invalid/key')).rejects.toMatchObject({
        status: 401,
      });
      expect(auth.refreshes).toBe(0);
    });
  });
});

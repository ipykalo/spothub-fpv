import { Injector, runInInjectionContext } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Role, type CurrentUserDto } from '@spothub/shared';
import { Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { API_BASE_URL } from '../api/api.tokens';
import { AuthStore } from './auth.store';

/**
 * The session. Two rules carry real weight: the access token never leaves
 * memory — anything in localStorage is readable by an injected script — and a
 * burst of expired requests causes exactly one refresh, because every one of
 * them arrives at the same moment when a token lapses.
 */
describe('AuthStore', () => {
  const user: CurrentUserDto = {
    id: 'u1',
    email: 'pilot@example.com',
    displayName: 'Ivan',
    avatarUrl: null,
    role: Role.User,
  };

  class FakeHttp {
    calls: string[] = [];
    refreshFails = false;
    meFails = false;
    logoutFails = false;
    /** Resolves the pending refresh by hand, to catch two at once in flight. */
    pending: (() => void) | null = null;
    tokens = ['token-1', 'token-2'];
    issued = 0;
    profile: CurrentUserDto = user;

    post<T>(url: string): Observable<T> {
      this.calls.push(`POST ${url}`);

      if (url.endsWith('/auth/logout')) {
        return this.logoutFails
          ? throwError(() => new Error('offline'))
          : (of(null) as Observable<T>);
      }

      if (this.refreshFails) {
        return throwError(() => new Error('no cookie'));
      }

      const accessToken = this.tokens[Math.min(this.issued, this.tokens.length - 1)];
      this.issued += 1;
      const answer = { accessToken, expiresIn: 900 } as T;

      // Held open until released, so a test can start a second refresh while
      // the first is still in flight.
      return this.pending === null
        ? of(answer)
        : new Observable<T>((subscriber) => {
            this.pending = (): void => {
              subscriber.next(answer);
              subscriber.complete();
            };
          });
    }

    get<T>(url: string): Observable<T> {
      this.calls.push(`GET ${url}`);

      return this.meFails
        ? throwError(() => new Error('401'))
        : (of(this.profile) as Observable<T>);
    }
  }

  let http: FakeHttp;
  let store: AuthStore;

  beforeEach(() => {
    http = new FakeHttp();
    const injector = Injector.create({
      providers: [
        { provide: HttpClient, useValue: http },
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    });

    store = runInInjectionContext(injector, () => new AuthStore());
  });

  it('starts signed out and not yet asked', () => {
    expect(store.token()).toBeNull();
    expect(store.user()).toBeNull();
    expect(store.isAuthenticated()).toBe(false);
    expect(store.ready()).toBe(false);
  });

  describe('restoring a session', () => {
    it('exchanges the refresh cookie for a token and reads who that is', async () => {
      await store.restoreSession();

      expect(http.calls).toEqual(['POST /api/auth/refresh', 'GET /api/auth/me']);
      expect(store.token()).toBe('token-1');
      expect(store.user()).toEqual(user);
      expect(store.isAuthenticated()).toBe(true);
      expect(store.ready()).toBe(true);
    });

    it('is ready even when there was no session to restore', async () => {
      http.refreshFails = true;

      await store.restoreSession();

      expect(store.ready()).toBe(true);
      expect(store.isAuthenticated()).toBe(false);
      expect(store.token()).toBeNull();
    });

    it('asks once: a second page does not re-ask on every navigation', async () => {
      await store.restoreSession();
      await store.restoreSession();

      expect(http.calls).toEqual(['POST /api/auth/refresh', 'GET /api/auth/me']);
    });
  });

  describe('the token handed back by the OAuth callback', () => {
    it('is adopted without a refresh round trip', async () => {
      await store.adoptToken('from-google');

      expect(http.calls).toEqual(['GET /api/auth/me']);
      expect(store.token()).toBe('from-google');
      expect(store.ready()).toBe(true);
    });

    it('leaves nobody signed in when the token turns out not to work', async () => {
      http.meFails = true;

      await store.adoptToken('stale');

      expect(store.user()).toBeNull();
      expect(store.isAuthenticated()).toBe(false);
    });
  });

  describe('refreshing', () => {
    it('answers whether there is still a session', async () => {
      expect(await store.refresh()).toBe(true);

      http.refreshFails = true;

      expect(await store.refresh()).toBe(false);
      expect(store.token()).toBeNull();
      expect(store.user()).toBeNull();
    });

    it('makes one round trip for a burst of expired requests', async () => {
      // Keep the first refresh open so the second arrives while it is in flight.
      http.pending = (): void => undefined;

      const first = store.refresh();
      const second = store.refresh();

      http.pending();

      expect(await first).toBe(true);
      expect(await second).toBe(true);
      expect(http.calls.filter((call) => call.includes('refresh'))).toHaveLength(1);
    });

    it('refreshes again once the first one is over, rather than answering from it forever', async () => {
      await store.refresh();
      await store.refresh();

      expect(http.calls.filter((call) => call.includes('refresh'))).toHaveLength(2);
      expect(store.token()).toBe('token-2');
    });
  });

  describe('the display name', () => {
    it('is what a pilot chose, falling back to their address', async () => {
      await store.adoptToken('t');
      expect(store.displayName()).toBe('Ivan');

      http.profile = { ...user, displayName: null };
      await store.adoptToken('t');
      expect(store.displayName()).toBe('pilot@example.com');
    });

    it('is empty rather than undefined when nobody is signed in', () => {
      expect(store.displayName()).toBe('');
    });
  });

  describe('signing out', () => {
    it('forgets the token and who it was', async () => {
      await store.restoreSession();

      await store.logout();

      expect(store.token()).toBeNull();
      expect(store.user()).toBeNull();
      expect(store.isAuthenticated()).toBe(false);
    });

    it('forgets them even when the server could not be told', async () => {
      await store.restoreSession();
      http.logoutFails = true;

      await store.logout();

      expect(store.token()).toBeNull();
      expect(store.user()).toBeNull();
    });
  });
});

import { HttpClient, type HttpParams } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { BuildStatus } from '@spothub/shared';
import { type Observable, of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { API_BASE_URL } from '../../core/api/api.tokens';
import { BuildsApi } from './builds.api';

/**
 * Transport only. The hangar and the builds other pilots shared are two
 * routes rather than one with a flag, and both take the same filters — so the
 * check here is that the shared list is a different address and that an
 * unset filter is left out rather than sent empty.
 */
describe('BuildsApi', () => {
  interface Call {
    readonly method: string;
    readonly url: string;
    readonly body?: unknown;
    readonly params?: HttpParams;
  }

  class FakeHttp {
    calls: Call[] = [];

    get<T>(url: string, options?: { params?: HttpParams }): Observable<T> {
      this.calls.push({ method: 'GET', url, params: options?.params });

      return of([] as T);
    }

    post<T>(url: string, body: unknown): Observable<T> {
      this.calls.push({ method: 'POST', url, body });

      return of({} as T);
    }

    patch<T>(url: string, body: unknown): Observable<T> {
      this.calls.push({ method: 'PATCH', url, body });

      return of({} as T);
    }

    delete<T>(url: string): Observable<T> {
      this.calls.push({ method: 'DELETE', url });

      return of(null as T);
    }
  }

  let http: FakeHttp;
  let api: BuildsApi;

  beforeEach(() => {
    http = new FakeHttp();
    const injector = Injector.create({
      providers: [
        { provide: HttpClient, useValue: http },
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    });

    api = runInInjectionContext(injector, () => new BuildsApi());
  });

  const last = (): Call => http.calls[http.calls.length - 1];

  describe('the two lists', () => {
    it('are different routes: the viewer’s hangar, and what others shared', () => {
      api.list().subscribe();
      expect(last().url).toBe('/api/builds');

      api.listShared().subscribe();
      expect(last().url).toBe('/api/builds/shared');
    });

    it('take the same filters, and send only the ones that are set', () => {
      api.list().subscribe();
      expect(last().params?.keys()).toEqual([]);

      api.listShared({ status: BuildStatus.Active, search: 'cinelog' }).subscribe();
      expect(last().params?.get('status')).toBe(BuildStatus.Active);
      expect(last().params?.get('search')).toBe('cinelog');
    });
  });

  describe('one build', () => {
    it('is read, written, changed and deleted at its own address', () => {
      api.getOne('b1').subscribe();
      expect(last()).toMatchObject({ method: 'GET', url: '/api/builds/b1' });

      api.create({ name: 'Cinelog20' } as never).subscribe();
      expect(last()).toMatchObject({
        method: 'POST',
        url: '/api/builds',
        body: { name: 'Cinelog20' },
      });

      api.update('b1', {}).subscribe();
      expect(last()).toMatchObject({ method: 'PATCH', url: '/api/builds/b1' });

      api.remove('b1').subscribe();
      expect(last()).toMatchObject({ method: 'DELETE', url: '/api/builds/b1' });
    });
  });
});

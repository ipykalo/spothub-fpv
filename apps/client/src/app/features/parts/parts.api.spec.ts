import { HttpClient, type HttpParams } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { PartCategory, PartCondition } from '@spothub/shared';
import { type Observable, of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { API_BASE_URL } from '../../core/api/api.tokens';
import { PartsApi } from './parts.api';

/**
 * Transport only, so what there is to check is the address each call builds —
 * a unit and a source hang off a part, and getting one of those paths wrong
 * is a 404 the compiler cannot see — and the one piece of real logic: a
 * filter that is not set is left out of the query rather than sent empty.
 */
describe('PartsApi', () => {
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
  let api: PartsApi;

  beforeEach(() => {
    http = new FakeHttp();
    const injector = Injector.create({
      providers: [
        { provide: HttpClient, useValue: http },
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    });

    api = runInInjectionContext(injector, () => new PartsApi());
  });

  const last = (): Call => http.calls[http.calls.length - 1];

  describe('the shelf', () => {
    it('is read with no query at all when nothing is filtered', () => {
      api.list().subscribe();

      expect(last()).toMatchObject({ method: 'GET', url: '/api/parts' });
      expect(last().params?.keys()).toEqual([]);
    });

    it('carries only the filters that are set', () => {
      api
        .list({ category: PartCategory.Motor, condition: PartCondition.Broken })
        .subscribe();

      const { params } = last();

      expect(params?.get('category')).toBe(PartCategory.Motor);
      expect(params?.get('condition')).toBe(PartCondition.Broken);
      expect(params?.has('search')).toBe(false);
    });

    it('sends the search box’s words as they were typed', () => {
      api.list({ search: 'T-Motor 1404' }).subscribe();

      expect(last().params?.get('search')).toBe('T-Motor 1404');
    });
  });

  describe('one part', () => {
    it('is read, written, changed and deleted at its own address', () => {
      api.getOne('p1').subscribe();
      expect(last()).toMatchObject({ method: 'GET', url: '/api/parts/p1' });

      api.create({ note: 'x' } as never).subscribe();
      expect(last()).toMatchObject({ method: 'POST', url: '/api/parts' });

      api.update('p1', {}).subscribe();
      expect(last()).toMatchObject({ method: 'PATCH', url: '/api/parts/p1' });

      api.remove('p1').subscribe();
      expect(last()).toMatchObject({ method: 'DELETE', url: '/api/parts/p1' });
    });
  });

  describe('a part’s units', () => {
    it('hang off the part they belong to', () => {
      api.addUnit('p1', {} as never).subscribe();
      expect(last()).toMatchObject({ method: 'POST', url: '/api/parts/p1/units' });

      api.updateUnit('p1', 'u1', {}).subscribe();
      expect(last()).toMatchObject({ method: 'PATCH', url: '/api/parts/p1/units/u1' });

      api.removeUnit('p1', 'u1').subscribe();
      expect(last()).toMatchObject({ method: 'DELETE', url: '/api/parts/p1/units/u1' });
    });
  });

  describe('a part’s sources', () => {
    it('do the same', () => {
      api.addSource('p1', {} as never).subscribe();
      expect(last()).toMatchObject({ method: 'POST', url: '/api/parts/p1/sources' });

      api.updateSource('p1', 's1', {}).subscribe();
      expect(last()).toMatchObject({ method: 'PATCH', url: '/api/parts/p1/sources/s1' });

      api.removeSource('p1', 's1').subscribe();
      expect(last()).toMatchObject({ method: 'DELETE', url: '/api/parts/p1/sources/s1' });
    });
  });

  describe('pasting a shop link', () => {
    it('asks the API to read the page, so the browser never fetches it', () => {
      api.urlPreview('https://shop.example/motor').subscribe();

      expect(last()).toMatchObject({
        method: 'POST',
        url: '/api/parts/url-preview',
        body: { url: 'https://shop.example/motor' },
      });
    });
  });
});

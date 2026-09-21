import { HttpClient, type HttpParams } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { type Observable, of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { API_BASE_URL } from '../../core/api/api.tokens';
import { PostsApi } from './posts.api';

/**
 * Transport only. The two addresses worth being sure of are the author's own
 * list and the public feed — they are different routes, and answering the
 * blog from the first would show a visitor somebody's drafts — and the image
 * routes, which hang off the post the image belongs to.
 */
describe('PostsApi', () => {
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
  let api: PostsApi;

  beforeEach(() => {
    http = new FakeHttp();
    const injector = Injector.create({
      providers: [
        { provide: HttpClient, useValue: http },
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    });

    api = runInInjectionContext(injector, () => new PostsApi());
  });

  const last = (): Call => http.calls[http.calls.length - 1];

  describe('the two lists', () => {
    it('are different routes: the author’s own, and what anyone may read', () => {
      api.listMine().subscribe();
      expect(last().url).toBe('/api/posts');

      api.listPublished().subscribe();
      expect(last().url).toBe('/api/posts/published');
    });

    it('narrow the feed to one build only when asked to', () => {
      api.listPublished().subscribe();
      expect(last().params).toBeUndefined();

      api.listPublished({ buildId: 'b1' }).subscribe();
      expect(last().params?.get('buildId')).toBe('b1');
    });
  });

  describe('one post', () => {
    it('is read, written, changed and deleted at its own address', () => {
      api.getOne('p1').subscribe();
      expect(last()).toMatchObject({ method: 'GET', url: '/api/posts/p1' });

      api.create({} as never).subscribe();
      expect(last()).toMatchObject({ method: 'POST', url: '/api/posts' });

      api.update('p1', {}).subscribe();
      expect(last()).toMatchObject({ method: 'PATCH', url: '/api/posts/p1' });

      api.remove('p1').subscribe();
      expect(last()).toMatchObject({ method: 'DELETE', url: '/api/posts/p1' });
    });
  });

  describe('a post’s images', () => {
    it('are uploaded and committed under the post they belong to', () => {
      api.requestImageUpload('p1', {} as never).subscribe();
      expect(last()).toMatchObject({
        method: 'POST',
        url: '/api/posts/p1/images/uploads',
      });

      api.commitImage('p1', 'a1').subscribe();
      expect(last()).toMatchObject({
        method: 'POST',
        url: '/api/posts/p1/images/a1/commit',
      });
    });

    it('include the cover, which can also be cleared', () => {
      api.setCover('p1', 'a1').subscribe();
      expect(last()).toMatchObject({
        method: 'PATCH',
        url: '/api/posts/p1/images/cover',
        body: { assetId: 'a1' },
      });

      api.setCover('p1', null).subscribe();
      expect(last().body).toEqual({ assetId: null });
    });
  });
});

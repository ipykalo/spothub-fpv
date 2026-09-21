import { HttpClient } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { CommentSubject } from '@spothub/shared';
import { type Observable, of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { API_BASE_URL } from '../../core/api/api.tokens';
import { CommentsApi } from './comments.api';

/**
 * One conversation module serves spots, builds and posts, so every call here
 * is the same six routes under a different collection. That mapping is the
 * whole of this file's logic, and getting it wrong sends a spot's question to
 * the builds route — which answers 404 and looks like a missing spot.
 */
describe('CommentsApi', () => {
  class FakeHttp {
    calls: { method: string; url: string; body?: unknown }[] = [];

    get<T>(url: string): Observable<T> {
      this.calls.push({ method: 'GET', url });

      return of({} as T);
    }

    post<T>(url: string, body: unknown): Observable<T> {
      this.calls.push({ method: 'POST', url, body });

      return of({} as T);
    }

    patch<T>(url: string, body: unknown): Observable<T> {
      this.calls.push({ method: 'PATCH', url, body });

      return of({} as T);
    }

    put<T>(url: string, body: unknown): Observable<T> {
      this.calls.push({ method: 'PUT', url, body });

      return of({} as T);
    }

    delete<T>(url: string): Observable<T> {
      this.calls.push({ method: 'DELETE', url });

      return of({} as T);
    }
  }

  let http: FakeHttp;
  let api: CommentsApi;

  beforeEach(() => {
    http = new FakeHttp();
    const injector = Injector.create({
      providers: [
        { provide: HttpClient, useValue: http },
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    });

    api = runInInjectionContext(injector, () => new CommentsApi());
  });

  const last = (): { method: string; url: string; body?: unknown } =>
    http.calls[http.calls.length - 1];

  describe('which collection a subject lives under', () => {
    it('is spots, builds or posts', () => {
      api.list(CommentSubject.Spot, 's1').subscribe();
      expect(last().url).toBe('/api/spots/s1/comments');

      api.list(CommentSubject.Build, 'b1').subscribe();
      expect(last().url).toBe('/api/builds/b1/comments');

      api.list(CommentSubject.Post, 'p1').subscribe();
      expect(last().url).toBe('/api/posts/p1/comments');
    });
  });

  describe('the six routes', () => {
    it('are the same wherever the conversation hangs', () => {
      api.create(CommentSubject.Post, 'p1', { body: 'Nice' } as never).subscribe();
      expect(last()).toMatchObject({
        method: 'POST',
        url: '/api/posts/p1/comments',
        body: { body: 'Nice' },
      });

      api.update(CommentSubject.Post, 'p1', 'c1', {} as never).subscribe();
      expect(last()).toMatchObject({ method: 'PATCH', url: '/api/posts/p1/comments/c1' });

      api.remove(CommentSubject.Post, 'p1', 'c1').subscribe();
      expect(last()).toMatchObject({
        method: 'DELETE',
        url: '/api/posts/p1/comments/c1',
      });

      api.markRead(CommentSubject.Post, 'p1').subscribe();
      expect(last()).toMatchObject({
        method: 'POST',
        url: '/api/posts/p1/comments/read',
      });
    });

    it('include marking a reply as the answer, which only a spot or build has', () => {
      api.setAnswer(CommentSubject.Spot, 's1', 'c1', { isAnswer: true }).subscribe();

      expect(last()).toMatchObject({
        method: 'PUT',
        url: '/api/spots/s1/comments/c1/answer',
        body: { isAnswer: true },
      });
    });
  });

  describe('the unread count', () => {
    it('is asked for across every subject at once, for the nav badges', () => {
      api.unread().subscribe();

      expect(last()).toMatchObject({ method: 'GET', url: '/api/comments/unread' });
    });
  });
});

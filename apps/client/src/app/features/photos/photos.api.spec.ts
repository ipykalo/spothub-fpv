import { HttpClient } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { type Observable, of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { API_BASE_URL } from '../../core/api/api.tokens';
import { PhotosApi } from './photos.api';

/**
 * Transport only. Every photo route hangs off the build it belongs to, and
 * the three steps of an upload are three different addresses under it — which
 * is the part worth being sure of, since a wrong one only shows up as a
 * failed upload after the bytes have already gone to storage.
 */
describe('PhotosApi', () => {
  class FakeHttp {
    calls: { method: string; url: string; body?: unknown }[] = [];

    get<T>(url: string): Observable<T> {
      this.calls.push({ method: 'GET', url });

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
  let api: PhotosApi;

  beforeEach(() => {
    http = new FakeHttp();
    const injector = Injector.create({
      providers: [
        { provide: HttpClient, useValue: http },
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    });

    api = runInInjectionContext(injector, () => new PhotosApi());
  });

  const last = (): { method: string; url: string; body?: unknown } =>
    http.calls[http.calls.length - 1];

  it('reads a build’s gallery from under that build', () => {
    api.list('b1').subscribe();

    expect(last()).toMatchObject({ method: 'GET', url: '/api/builds/b1/photos' });
  });

  it('asks for somewhere to PUT, then commits at the asset’s own address', () => {
    api.requestUpload('b1', {} as never).subscribe();
    expect(last()).toMatchObject({
      method: 'POST',
      url: '/api/builds/b1/photos/uploads',
    });

    api.commit('b1', 'a1').subscribe();
    expect(last()).toMatchObject({
      method: 'POST',
      url: '/api/builds/b1/photos/a1/commit',
    });
  });

  it('deletes one photo by its own address', () => {
    api.remove('b1', 'a1').subscribe();

    expect(last()).toMatchObject({ method: 'DELETE', url: '/api/builds/b1/photos/a1' });
  });

  it('sends the whole order, so a drop cannot be ambiguous', () => {
    api.reorder('b1', ['a3', 'a1', 'a2']).subscribe();

    expect(last()).toMatchObject({
      method: 'PATCH',
      url: '/api/builds/b1/photos/order',
      body: { assetIds: ['a3', 'a1', 'a2'] },
    });
  });

  it('sets the cover, or clears it back to the placeholder', () => {
    api.setCover('b1', 'a1').subscribe();
    expect(last()).toMatchObject({
      method: 'PATCH',
      url: '/api/builds/b1/photos/cover',
      body: { assetId: 'a1' },
    });

    api.setCover('b1', null).subscribe();
    expect(last().body).toEqual({ assetId: null });
  });
});

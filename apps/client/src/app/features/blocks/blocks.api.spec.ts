import { HttpClient } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { type Observable, of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { API_BASE_URL } from '../../core/api/api.tokens';
import { BlocksApi } from './blocks.api';

/** Transport only: the list is the pilot's own, and a block names the pilot blocked. */
describe('BlocksApi', () => {
  class FakeHttp {
    calls: string[] = [];

    get<T>(url: string): Observable<T> {
      this.calls.push(`GET ${url}`);
      return of([] as T);
    }

    put<T>(url: string): Observable<T> {
      this.calls.push(`PUT ${url}`);
      return of(null as T);
    }

    delete<T>(url: string): Observable<T> {
      this.calls.push(`DELETE ${url}`);
      return of(null as T);
    }
  }

  let http: FakeHttp;
  let api: BlocksApi;

  beforeEach(() => {
    http = new FakeHttp();
    const injector = Injector.create({
      providers: [
        { provide: HttpClient, useValue: http },
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    });
    api = runInInjectionContext(injector, () => new BlocksApi());
  });

  it('lists, blocks and unblocks at the users routes', () => {
    api.list().subscribe();
    api.block('u1').subscribe();
    api.unblock('u1').subscribe();

    expect(http.calls).toEqual([
      'GET /api/users/me/blocks',
      'PUT /api/users/blocks/u1',
      'DELETE /api/users/blocks/u1',
    ]);
  });
});

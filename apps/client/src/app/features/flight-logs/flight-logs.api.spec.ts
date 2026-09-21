import { HttpClient } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { type Observable, of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { API_BASE_URL } from '../../core/api/api.tokens';
import { FlightLogsApi } from './flight-logs.api';

/**
 * Transport only. These routes sit under `flight-logs` rather than under a
 * flight, because the file is this module's to parse — so a flight's track
 * and its timeline are addressed by flight id from here, which is the piece
 * worth being sure of. The presigned PUT itself is not tested: it builds an
 * `HttpRequest` against object storage and reports progress, which is the
 * browser's work rather than ours.
 */
describe('FlightLogsApi', () => {
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
  }

  let http: FakeHttp;
  let api: FlightLogsApi;

  beforeEach(() => {
    http = new FakeHttp();
    const injector = Injector.create({
      providers: [
        { provide: HttpClient, useValue: http },
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    });

    api = runInInjectionContext(injector, () => new FlightLogsApi());
  });

  const last = (): { method: string; url: string; body?: unknown } =>
    http.calls[http.calls.length - 1];

  it('asks which checksums are already imported, so only new files go up', () => {
    api.known(['aa', 'bb']).subscribe();

    expect(last()).toMatchObject({
      method: 'POST',
      url: '/api/flight-logs/known',
      body: { checksums: ['aa', 'bb'] },
    });
  });

  it('reserves an upload and then starts the import as two separate calls', () => {
    api.requestUpload({} as never).subscribe();
    expect(last()).toMatchObject({ method: 'POST', url: '/api/flight-logs/uploads' });

    api.startImport({ logFileIds: ['l1'] } as never).subscribe();
    expect(last()).toMatchObject({ method: 'POST', url: '/api/flight-logs/imports' });
  });

  it('watches one import by its own id', () => {
    api.getImport('i1').subscribe();

    expect(last()).toMatchObject({ method: 'GET', url: '/api/flight-logs/imports/i1' });
  });

  it('reads a flight’s path and its charts back by flight, not by file', () => {
    api.track('f1').subscribe();
    expect(last()).toMatchObject({ method: 'GET', url: '/api/flight-logs/tracks/f1' });

    api.timeline('f1').subscribe();
    expect(last()).toMatchObject({
      method: 'GET',
      url: '/api/flight-logs/timelines/f1',
    });
  });
});

import { HttpErrorResponse } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import {
  type KnownLogsResultDto,
  type LogImportDto,
  LogImportStatus,
  type LogUploadTicketDto,
} from '@spothub/shared';
import { type Observable, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FlightLogsApi } from './flight-logs.api';
import { FlightLogsStore } from './flight-logs.store';

/**
 * The import state machine: hash every dropped file, ask which are new, upload
 * only those, start the job and watch it.
 *
 * Driven with a stand-in for the API rather than a TestBed — the store is a
 * class holding signals, so an injection context and a fake service are all it
 * needs. Every step here is one a pilot meets: dropping the whole LOGS folder
 * again after a session, a file too big for the server, a flat battery in the
 * middle of an upload.
 */
describe('FlightLogsStore', () => {
  const ticket: LogUploadTicketDto = {
    logFileId: 'log-1',
    uploadUrl: 'https://storage.invalid/put',
    contentType: 'text/csv',
    expiresInSeconds: 600,
  };

  const batch = (over: Partial<LogImportDto> = {}): LogImportDto => ({
    id: 'import-1',
    status: LogImportStatus.Done,
    buildId: null,
    flightCount: 2,
    files: [],
    error: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:01:00.000Z',
    ...over,
  });

  /** What the store calls, with every answer under the test's control. */
  class FakeApi {
    knownChecksums: string[] = [];
    uploads: string[] = [];
    started: { logFileIds: readonly string[]; buildId: string | null }[] = [];
    imports: LogImportDto[] = [batch()];
    uploadFails: string | null = null;

    known(checksums: readonly string[]): Observable<KnownLogsResultDto> {
      return of({
        known: checksums.filter((checksum) => this.knownChecksums.includes(checksum)),
      });
    }

    requestUpload(body: { fileName: string }): Observable<LogUploadTicketDto> {
      this.uploads.push(body.fileName);

      return of({ ...ticket, logFileId: `log-${String(this.uploads.length)}` });
    }

    upload(): Observable<number> {
      if (this.uploadFails !== null) {
        return throwError(
          () => new HttpErrorResponse({ error: { message: this.uploadFails } }),
        );
      }

      return of(50, 100);
    }

    startImport(body: {
      logFileIds: readonly string[];
      buildId: string | null;
    }): Observable<LogImportDto> {
      this.started.push(body);

      return of(this.imports[this.started.length - 1] ?? batch());
    }

    getImport(): Observable<LogImportDto> {
      return of(batch());
    }
  }

  let api: FakeApi;
  let store: FlightLogsStore;

  const log = (name: string, contents = 'Date,Time\n', size?: number): File => {
    const file = new File([contents], name, { type: 'text/csv' });

    if (size !== undefined) {
      Object.defineProperty(file, 'size', { value: size });
    }

    return file;
  };

  beforeEach(() => {
    api = new FakeApi();
    const injector = Injector.create({
      providers: [{ provide: FlightLogsApi, useValue: api }],
    });

    store = runInInjectionContext(injector, () => new FlightLogsStore());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts idle, with nothing to show', () => {
    expect(store.phase()).toBe('idle');
    expect(store.files()).toEqual([]);
    expect(store.importing()).toBe(false);
    expect(store.importedFlights()).toBe(0);
  });

  it('imports the logs in a drop and reports what came of it', async () => {
    await store.importLogs(
      [log('LOG001.csv'), log('btfl_001.bbl', 'blackbox bytes')],
      'build-1',
      null,
    );

    expect(api.uploads).toEqual(['LOG001.csv', 'btfl_001.bbl']);
    expect(api.started).toEqual([
      { logFileIds: ['log-1', 'log-2'], buildId: 'build-1', flownOn: null },
    ]);
    expect(store.phase()).toBe('done');
    expect(store.importing()).toBe(false);
    expect(store.files().map((file) => file.state)).toEqual(['uploaded', 'uploaded']);
    expect(store.importedFlights()).toBe(2);
  });

  it('ignores what is not a log, and says so when nothing is left', async () => {
    await store.importLogs([log('notes.txt'), log('empty.csv', '', 0)], null, null);

    expect(store.phase()).toBe('failed');
    expect(store.message()).toMatch(/Nothing to import/);
    expect(api.uploads).toEqual([]);
  });

  it('skips a log the server already has, without uploading it again', async () => {
    const dropped = log('LOG001.csv');
    api.knownChecksums = [await sha256(dropped)];

    await store.importLogs([dropped], null, null);

    expect(api.uploads).toEqual([]);
    expect(store.phase()).toBe('done');
    expect(store.message()).toMatch(/already imported/);
    expect(store.files()[0]).toMatchObject({ state: 'known', progress: 100 });
  });

  it('counts the same file dropped twice once', async () => {
    await store.importLogs([log('LOG001.csv'), log('copy of LOG001.csv')], null, null);

    expect(api.uploads).toEqual(['LOG001.csv']);
    expect(store.files().map((file) => file.state)).toEqual(['uploaded', 'known']);
  });

  it('refuses a log larger than the server takes, and carries on with the rest', async () => {
    await store.importLogs(
      [log('huge.csv', 'x', 26 * 1024 * 1024), log('LOG002.csv', 'other\n')],
      null,
      null,
    );

    expect(store.files()[0]).toMatchObject({
      state: 'failed',
      error: 'Larger than 25 MB',
    });
    expect(api.uploads).toEqual(['LOG002.csv']);
    expect(store.phase()).toBe('done');
  });

  it('gives up when every upload failed, quoting what the API said', async () => {
    api.uploadFails = 'Storage is full';

    await store.importLogs([log('LOG001.csv')], null, null);

    expect(store.files()[0]).toMatchObject({ state: 'failed', error: 'Storage is full' });
    expect(store.phase()).toBe('failed');
    expect(store.message()).toBe('None of the logs could be uploaded.');
    expect(api.started).toEqual([]);
  });

  it('reports a batch the worker could not parse as a failed import', async () => {
    api.imports = [
      batch({ status: LogImportStatus.Failed, error: 'Not a log', flightCount: 0 }),
    ];

    await store.importLogs([log('LOG001.csv')], null, null);

    expect(store.phase()).toBe('failed');
    expect(store.batches()[0]?.error).toBe('Not a log');
  });

  // Real time rather than fake timers: the store reaches its first poll only
  // after hashing the file, so a fake clock advanced from the test races it.
  // One poll interval is a second and a half, which is worth the certainty.
  it('waits for a queued import, asking again until the worker is done', async () => {
    api.imports = [batch({ status: LogImportStatus.Queued })];
    const asked = vi.spyOn(api, 'getImport');

    await store.importLogs([log('LOG001.csv')], null, null);

    expect(asked).toHaveBeenCalledOnce();
    expect(store.phase()).toBe('done');
  });

  it('forgets the last import when the panel is reset', async () => {
    await store.importLogs([log('LOG001.csv')], null, null);

    store.reset();

    expect(store.phase()).toBe('idle');
    expect(store.files()).toEqual([]);
    expect(store.batches()).toEqual([]);
    expect(store.message()).toBeNull();
  });
});

/** The same digest the store sends, so a test can say "the server has this one". */
async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

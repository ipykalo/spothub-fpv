import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import {
  LogImportStatus,
  type LogImportDto,
  MAX_LOG_BYTES,
  MAX_LOGS_PER_IMPORT,
  type SessionDto,
} from '@spothub/shared';
import { firstValueFrom, lastValueFrom, tap } from 'rxjs';

import { FlightsApi } from './flights.api';

/** Where one dropped file has got to. */
export type ImportFileState =
  | 'hashing'
  /** Already imported, or the same file twice in one drop. Skipped. */
  | 'known'
  | 'uploading'
  | 'uploaded'
  | 'failed';

export interface ImportFile {
  readonly key: string;
  readonly name: string;
  readonly state: ImportFileState;
  readonly progress: number;
  readonly error: string | null;
}

export type ImportPhase =
  | 'idle'
  /** Reading checksums and asking which logs are new. */
  | 'preparing'
  | 'uploading'
  /** Uploaded; the worker is parsing. */
  | 'processing'
  | 'done'
  | 'failed';

/** How often to ask whether the worker has finished. */
const POLL_MS = 1_500;

/** Give up watching after this; the import carries on without us. */
const POLL_LIMIT_MS = 15 * 60_000;

/** The checksum lookup's own limit, per request. */
const CHECKSUMS_PER_REQUEST = MAX_LOGS_PER_IMPORT * 4;

/**
 * Signal-backed state for flights, and the import that brings them in.
 *
 * An import is one intent from the outside — "here is my LOGS folder" — and
 * several steps inside: hash every file, ask which are new, upload only
 * those, start the job and watch it. No component should have to know the
 * order, so it lives here, like the photo upload does.
 */
@Injectable({ providedIn: 'root' })
export class FlightsStore {
  private readonly api = inject(FlightsApi);

  private readonly items = signal<readonly SessionDto[]>([]);
  private readonly busy = signal(false);
  private readonly failure = signal<string | null>(null);

  private readonly importFiles = signal<readonly ImportFile[]>([]);
  private readonly importPhase = signal<ImportPhase>('idle');
  private readonly importBatches = signal<readonly LogImportDto[]>([]);
  private readonly importMessage = signal<string | null>(null);

  readonly sessions = this.items.asReadonly();
  readonly loading = this.busy.asReadonly();
  readonly error = this.failure.asReadonly();

  readonly files = this.importFiles.asReadonly();
  readonly phase = this.importPhase.asReadonly();
  readonly batches = this.importBatches.asReadonly();
  readonly message = this.importMessage.asReadonly();

  readonly isEmpty = computed(() => !this.busy() && this.items().length === 0);

  readonly flightTotal = computed(() =>
    this.items().reduce((sum, session) => sum + session.flightCount, 0),
  );

  readonly importing = computed(() => {
    const phase = this.importPhase();
    return phase === 'preparing' || phase === 'uploading' || phase === 'processing';
  });

  /** New flights found across every batch of the last import. */
  readonly importedFlights = computed(() =>
    this.importBatches().reduce((sum, batch) => sum + batch.flightCount, 0),
  );

  async load(): Promise<void> {
    this.busy.set(true);
    this.failure.set(null);

    try {
      this.items.set(await firstValueFrom(this.api.sessions()));
    } catch {
      this.failure.set('Could not load your flights.');
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Imports whatever was dropped: a whole LOGS folder, or a handful of files.
   *
   * Anything that is not a `.csv` is ignored, a file already imported is
   * skipped without being uploaded, and the same file dropped twice counts
   * once — so dropping the whole folder again after the next session only
   * sends what is new.
   */
  async importLogs(dropped: readonly File[], buildId: string | null): Promise<void> {
    const logs = dropped.filter((file) => /\.csv$/i.test(file.name) && file.size > 0);

    this.importBatches.set([]);
    this.importMessage.set(null);
    this.importFiles.set(
      logs.map((file, index) => ({
        key: `${String(index)}:${file.name}`,
        name: file.name,
        state: 'hashing',
        progress: 0,
        error: null,
      })),
    );

    if (logs.length === 0) {
      this.finish('failed', 'Nothing to import — no .csv logs in what was dropped.');
      return;
    }

    this.importPhase.set('preparing');

    try {
      const fresh = await this.findNew(logs);

      if (fresh.length === 0) {
        this.finish('done', 'Nothing new — every log here is already imported.');
        return;
      }

      this.importPhase.set('uploading');
      const logFileIds = await this.upload(fresh);

      if (logFileIds.length === 0) {
        this.finish('failed', 'None of the logs could be uploaded.');
        return;
      }

      this.importPhase.set('processing');

      for (let start = 0; start < logFileIds.length; start += MAX_LOGS_PER_IMPORT) {
        const batch = await this.runBatch(
          logFileIds.slice(start, start + MAX_LOGS_PER_IMPORT),
          buildId,
        );
        this.importBatches.update((batches) => [...batches, batch]);
      }

      const failed = this.importBatches().some(
        (batch) => batch.status === LogImportStatus.Failed,
      );
      this.finish(failed ? 'failed' : 'done', null);
    } catch (error) {
      this.finish('failed', messageOf(error, 'The import could not be started.'));
    } finally {
      await this.load();
    }
  }

  /** Forgets the last import, so the panel starts clean. */
  resetImport(): void {
    this.importPhase.set('idle');
    this.importFiles.set([]);
    this.importBatches.set([]);
    this.importMessage.set(null);
  }

  async assignBuild(flightId: string, buildId: string | null): Promise<void> {
    const updated = await firstValueFrom(this.api.updateFlight(flightId, { buildId }));

    this.items.update((sessions) =>
      sessions.map((session) => ({
        ...session,
        flights: session.flights.map((flight) =>
          flight.id === updated.id ? updated : flight,
        ),
      })),
    );
  }

  /**
   * Re-read rather than patched: deleting a flight can split its session in
   * two, or remove it, and only the server knows how the rest regrouped.
   */
  async removeFlight(flightId: string): Promise<void> {
    await firstValueFrom(this.api.removeFlight(flightId));
    await this.load();
  }

  /** Hashes every file and drops the ones already imported. */
  private async findNew(
    logs: readonly File[],
  ): Promise<{ key: string; file: File; checksum: string }[]> {
    const hashed = await Promise.all(
      logs.map(async (file, index) => ({
        key: this.importFiles()[index]?.key ?? file.name,
        file,
        checksum: await sha256(file),
      })),
    );

    const known = new Set<string>();

    for (let start = 0; start < hashed.length; start += CHECKSUMS_PER_REQUEST) {
      const slice = hashed.slice(start, start + CHECKSUMS_PER_REQUEST);
      const answer = await firstValueFrom(
        this.api.known(slice.map((entry) => entry.checksum)),
      );
      answer.known.forEach((checksum) => known.add(checksum));
    }

    const seen = new Set<string>();
    const fresh: { key: string; file: File; checksum: string }[] = [];

    for (const entry of hashed) {
      if (known.has(entry.checksum) || seen.has(entry.checksum)) {
        this.patch(entry.key, { state: 'known', progress: 100 });
      } else {
        seen.add(entry.checksum);
        fresh.push(entry);
      }
    }

    return fresh;
  }

  /**
   * One file at a time: a season of logs should not open a hundred sockets.
   * A file that fails is marked and the rest carry on.
   */
  private async upload(
    fresh: readonly { key: string; file: File; checksum: string }[],
  ): Promise<string[]> {
    const ids: string[] = [];

    for (const { key, file, checksum } of fresh) {
      if (file.size > MAX_LOG_BYTES) {
        this.patch(key, { state: 'failed', error: 'Larger than 25 MB' });
        continue;
      }

      try {
        this.patch(key, { state: 'uploading', progress: 0 });

        const ticket = await firstValueFrom(
          this.api.requestUpload({ fileName: file.name, sizeBytes: file.size, checksum }),
        );

        await lastValueFrom(
          this.api.upload(ticket, file).pipe(
            tap((progress) => {
              this.patch(key, { progress });
            }),
          ),
        );

        this.patch(key, { state: 'uploaded', progress: 100 });
        ids.push(ticket.logFileId);
      } catch (error) {
        this.patch(key, { state: 'failed', error: messageOf(error, 'Upload failed') });
      }
    }

    return ids;
  }

  /** Starts one batch and watches it until the worker is done with it. */
  private async runBatch(
    logFileIds: readonly string[],
    buildId: string | null,
  ): Promise<LogImportDto> {
    let batch = await firstValueFrom(
      this.api.startImport({ logFileIds: [...logFileIds], buildId }),
    );
    const giveUpAt = Date.now() + POLL_LIMIT_MS;

    while (
      (batch.status === LogImportStatus.Queued ||
        batch.status === LogImportStatus.Running) &&
      Date.now() < giveUpAt
    ) {
      await delay(POLL_MS);
      batch = await firstValueFrom(this.api.getImport(batch.id));
    }

    return batch;
  }

  private finish(phase: 'done' | 'failed', message: string | null): void {
    this.importPhase.set(phase);
    this.importMessage.set(message);
  }

  private patch(key: string, change: Partial<ImportFile>): void {
    this.importFiles.update((files) =>
      files.map((file) => (file.key === key ? { ...file, ...change } : file)),
    );
  }
}

/** What the server uses to recognise a log it has already imported. */
async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The API's own explanation when it gave one, rather than a status code. */
function messageOf(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const body: unknown = error.error;

    if (
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
    ) {
      return body.message;
    }
  }

  return fallback;
}

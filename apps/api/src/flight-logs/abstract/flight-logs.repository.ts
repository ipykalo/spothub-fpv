import type { LogFormat } from '@spothub/shared';

import type {
  LogFileEntity,
  LogFileResult,
  LogImportEntity,
  LogImportResult,
  ReserveLogFileData,
} from '../flight-log.entity';

/** A flight's log, and the stretch of it that flight covers. */
export interface TrackSource {
  readonly storageKey: string;
  readonly format: LogFormat;
  readonly startedAt: Date;
  readonly endedAt: Date;
}

/**
 * Persistence contract for log files and the batches that import them.
 * `ownerId` first on every method, as everywhere else.
 */
export abstract class FlightLogsRepository {
  /**
   * Where a flight's track is kept and the window it covers: the GPX that
   * joined the flight when one did, otherwise the radio log the flight was
   * read from. Null when the flight is not this owner's.
   *
   * A join on `flights` inside this repository, as `findImportedChecksums`
   * already is: the file is this module's, and the flight only says which one
   * and between which times.
   */
  abstract findTrackSource(
    ownerId: string,
    flightId: string,
  ): Promise<TrackSource | null>;

  /**
   * Which of these checksums are already imported: parsed, and with a flight
   * from it still in the logbook (or never having held one). A log whose
   * flights were all deleted is not imported any more.
   */
  abstract findImportedChecksums(
    ownerId: string,
    checksums: readonly string[],
  ): Promise<string[]>;

  /**
   * A row for this file, ready to upload into.
   *
   * A file reserved before and never imported, one that failed, or one whose
   * flights were all deleted is reset and reused rather than rejected: the
   * checksum is unique per owner, and none of those should block the next
   * attempt. Null when the log is still imported.
   */
  abstract reserveFile(data: ReserveLogFileData): Promise<LogFileEntity | null>;

  /**
   * Opens a batch over these files. Null unless every one is the owner's and
   * still waiting to be imported. `flownOn` is a YYYY-MM-DD day, for the
   * batch's blackbox logs.
   */
  abstract createImport(
    ownerId: string,
    buildId: string | null,
    flownOn: string | null,
    fileIds: readonly string[],
  ): Promise<LogImportEntity | null>;

  abstract findImport(ownerId: string, id: string): Promise<LogImportEntity | null>;

  abstract markImportRunning(ownerId: string, id: string): Promise<void>;

  abstract recordFileResult(
    ownerId: string,
    fileId: string,
    result: LogFileResult,
  ): Promise<void>;

  abstract finishImport(
    ownerId: string,
    id: string,
    result: LogImportResult,
  ): Promise<void>;
}

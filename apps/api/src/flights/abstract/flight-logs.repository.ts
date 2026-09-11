import type {
  LogFileEntity,
  LogFileResult,
  LogImportEntity,
  LogImportResult,
  ReserveLogFileData,
} from '../entities/flight-log.entity';

/**
 * Persistence contract for log files and the batches that import them.
 * `ownerId` first on every method, as everywhere else.
 */
export abstract class FlightLogsRepository {
  /** Which of these checksums are already imported — parsed, not merely reserved. */
  abstract findParsedChecksums(
    ownerId: string,
    checksums: readonly string[],
  ): Promise<string[]>;

  /**
   * A row for this file, ready to upload into.
   *
   * A file reserved before and never imported, or one that failed, is reset
   * and reused rather than rejected: the checksum is unique per owner, and an
   * abandoned attempt must not block the next one. Null when that checksum
   * has already been parsed.
   */
  abstract reserveFile(data: ReserveLogFileData): Promise<LogFileEntity | null>;

  /**
   * Opens a batch over these files. Null unless every one is the owner's and
   * still waiting to be imported.
   */
  abstract createImport(
    ownerId: string,
    buildId: string | null,
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

import type { LogFileStatus, LogImportStatus } from '@spothub/shared';

/** One log file, as the domain understands it. */
export interface LogFileEntity {
  readonly id: string;
  readonly ownerId: string;
  readonly importId: string | null;
  readonly status: LogFileStatus;
  readonly storageKey: string;
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly checksum: string;
  readonly modelName: string | null;
  readonly flightCount: number;
  readonly error: string | null;
  readonly createdAt: Date;
}

/** One batch, with the files it carried. */
export interface LogImportEntity {
  readonly id: string;
  readonly ownerId: string;
  readonly buildId: string | null;
  readonly status: LogImportStatus;
  readonly flightCount: number;
  readonly error: string | null;
  readonly createdAt: Date;
  readonly finishedAt: Date | null;
  readonly files: readonly LogFileEntity[];
}

/** Reserving an upload for one file. */
export interface ReserveLogFileData {
  readonly ownerId: string;
  readonly storageKey: string;
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly checksum: string;
}

/** What parsing one file came to. */
export interface LogFileResult {
  readonly status: LogFileStatus;
  readonly modelName: string | null;
  readonly flightCount: number;
  readonly error: string | null;
}

/** How a whole batch ended. */
export interface LogImportResult {
  readonly status: LogImportStatus;
  readonly flightCount: number;
  readonly error: string | null;
}

import { z } from 'zod';

/**
 * The flight-log contract, defined once.
 *
 * Importing is three calls, and none of them carries a file. The client asks
 * which logs are already known (by checksum), reserves an upload for each new
 * one and PUTs the bytes straight to storage, then starts an import — which
 * answers 202 and runs in the background. Parsing inside a request would time
 * out on a real SD card and hold every byte in API memory.
 */

/** 25 MB. A ten-minute EdgeTX log at 10 Hz is about 2 MB. */
export const MAX_LOG_BYTES = 25 * 1024 * 1024;

/** Flights further apart than this start a new session. */
export const SESSION_GAP_MINUTES = 90;

/** How many files one import may carry — a full season's LOGS folder. */
export const MAX_LOGS_PER_IMPORT = 500;

export const LogFileStatus = {
  /** Reserved; the bytes may not have arrived yet. */
  Pending: 'PENDING',
  Parsed: 'PARSED',
  Failed: 'FAILED',
} as const;
export type LogFileStatus = (typeof LogFileStatus)[keyof typeof LogFileStatus];

export const LogImportStatus = {
  Queued: 'QUEUED',
  Running: 'RUNNING',
  Done: 'DONE',
  Failed: 'FAILED',
} as const;
export type LogImportStatus = (typeof LogImportStatus)[keyof typeof LogImportStatus];

const checksum = z
  .string()
  .regex(/^[a-f0-9]{64}$/, 'A checksum is 64 lowercase hex characters (SHA-256)');

/** Which of these files have already been imported. */
export const knownLogsSchema = z.object({
  checksums: z.array(checksum).max(MAX_LOGS_PER_IMPORT * 4),
});
export type KnownLogsDto = z.infer<typeof knownLogsSchema>;

export interface KnownLogsResultDto {
  readonly known: readonly string[];
}

/**
 * Asking for somewhere to upload one log to.
 *
 * Only EdgeTX CSV so far, recognised by extension: GPX and BBL join later as
 * further formats on the same pipeline.
 */
export const requestLogUploadSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1, 'A file needs a name')
    .max(255)
    .regex(/\.csv$/i, 'Only EdgeTX .csv logs can be imported so far'),
  sizeBytes: z.coerce
    .number()
    .int()
    .positive('That file is empty')
    .max(MAX_LOG_BYTES, 'That log is larger than 25 MB'),
  checksum,
});
export type RequestLogUploadDto = z.infer<typeof requestLogUploadSchema>;

/** Where to PUT one log, and the id to name in the import afterwards. */
export interface LogUploadTicketDto {
  readonly logFileId: string;
  /** Presigned PUT. Short-lived, and valid for exactly this one object. */
  readonly uploadUrl: string;
  /** Part of what was signed: the PUT must send exactly this. */
  readonly contentType: string;
  readonly expiresInSeconds: number;
}

export const createLogImportSchema = z.object({
  logFileIds: z
    .array(z.uuid())
    .min(1, 'Nothing to import')
    .max(MAX_LOGS_PER_IMPORT, `Import at most ${MAX_LOGS_PER_IMPORT} logs at once`),
  /**
   * Put every flight on this build. Null matches each log's model name against
   * the build names instead, and leaves the rest unassigned.
   */
  buildId: z.union([z.uuid(), z.null()]).default(null),
});
export type CreateLogImportDto = z.output<typeof createLogImportSchema>;

export interface LogImportFileDto {
  readonly id: string;
  readonly fileName: string;
  readonly status: LogFileStatus;
  readonly flightCount: number;
  readonly error: string | null;
}

export interface LogImportDto {
  readonly id: string;
  readonly status: LogImportStatus;
  readonly buildId: string | null;
  readonly flightCount: number;
  readonly files: readonly LogImportFileDto[];
  readonly error: string | null;
  readonly createdAt: string;
  readonly finishedAt: string | null;
}

export interface FlightDto {
  readonly id: string;
  readonly sessionId: string;
  readonly buildId: string | null;
  /** The build's name, so a list does not need the builds loaded to read. */
  readonly buildName: string | null;
  /** The radio model the log was recorded under. */
  readonly modelName: string | null;
  readonly fileName: string;
  /** The radio's wall clock, as recorded. Render in UTC to show it unchanged. */
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationS: number;
  readonly sampleCount: number;
  readonly startVoltage: number | null;
  readonly minVoltage: number | null;
  readonly endVoltage: number | null;
  readonly mahUsed: number | null;
  readonly maxCurrentA: number | null;
  readonly minLinkQuality: number | null;
  readonly hasGps: boolean;
  readonly distanceM: number | null;
  readonly maxAltitudeM: number | null;
  readonly maxSpeedKmh: number | null;
  readonly maxHomeDistanceM: number | null;
}

/** One outing, with its flights in the order they were flown. */
export interface SessionDto {
  readonly id: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly flightCount: number;
  readonly totalDurationS: number;
  readonly flights: readonly FlightDto[];
}

/** Reassigning a flight to a build, or clearing it with null. */
export const updateFlightSchema = z.object({
  buildId: z.union([z.uuid(), z.null()]),
});
export type UpdateFlightDto = z.infer<typeof updateFlightSchema>;

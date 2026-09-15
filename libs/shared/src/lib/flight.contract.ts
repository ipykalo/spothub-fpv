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

export const LogFormat = {
  /** The radio's own telemetry log. */
  EdgetxCsv: 'EDGETX_CSV',
  /** A flight controller's blackbox recording. */
  BetaflightBbl: 'BETAFLIGHT_BBL',
  /** A GPS track from a phone, goggles or a GPS logger. */
  Gpx: 'GPX',
} as const;
export type LogFormat = (typeof LogFormat)[keyof typeof LogFormat];

/**
 * Which parser reads a file, from its name — or null when it is not a log we
 * import. A flight controller's USB drive also offers `btfl_all.bbl`, the
 * whole flash in one file; it repeats every `btfl_NNN.bbl` beside it, so it is
 * left out rather than importing each flight twice.
 */
export function logFormatOf(fileName: string): LogFormat | null {
  const base = (fileName.split(/[\\/]/).at(-1) ?? fileName).toLowerCase();

  if (base.endsWith('.csv')) {
    return LogFormat.EdgetxCsv;
  }

  if ((base.endsWith('.bbl') || base.endsWith('.bfl')) && base !== 'btfl_all.bbl') {
    return LogFormat.BetaflightBbl;
  }

  if (base.endsWith('.gpx')) {
    return LogFormat.Gpx;
  }

  return null;
}

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
 * EdgeTX CSV, Betaflight blackbox and GPX tracks, recognised by extension.
 */
export const requestLogUploadSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1, 'A file needs a name')
    .max(255)
    .refine(
      (name) => logFormatOf(name) !== null,
      'Only EdgeTX .csv logs, Betaflight .bbl blackbox logs and .gpx tracks can be imported',
    ),
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
  /**
   * The day the batch's blackbox logs were flown, as YYYY-MM-DD. A flight
   * controller records no date; EdgeTX logs ignore this and keep the radio's.
   */
  flownOn: z.union([z.iso.date(), z.null()]).default(null),
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
  /** The battery pack flown: a unit of a battery part. */
  readonly batteryUnitId: string | null;
  /** The pack's name — part name and unit label or number — for the same reason. */
  readonly batteryName: string | null;
  /** The radio model the log was recorded under. */
  readonly modelName: string | null;
  readonly fileName: string;
  /** The radio's wall clock, as recorded. Render in UTC to show it unchanged. */
  readonly startedAt: string;
  readonly endedAt: string;
  /**
   * False for a blackbox log: it records only the day it was said to be
   * flown, so its times order the day's flights and are not shown.
   */
  readonly timeRecorded: boolean;
  readonly durationS: number;
  readonly sampleCount: number;
  readonly startVoltage: number | null;
  readonly minVoltage: number | null;
  readonly endVoltage: number | null;
  readonly mahUsed: number | null;
  readonly maxCurrentA: number | null;
  readonly minLinkQuality: number | null;
  /**
   * The link, the sticks and the radio's battery: logged by the receiver and
   * the radio themselves, so present even when the quad sends no telemetry.
   */
  readonly minRssiDbm: number | null;
  readonly minSnrDb: number | null;
  /** The telemetry link back from the quad. */
  readonly minDownlinkQuality: number | null;
  readonly maxTxPowerMw: number | null;
  /** The throttle stick, 0–100 %: where the stick sat, not what the motors did. */
  readonly avgThrottlePct: number | null;
  readonly maxThrottlePct: number | null;
  readonly minRadioVoltage: number | null;
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
  /** False unless every flight in it recorded its time of day. */
  readonly timeRecorded: boolean;
  readonly flightCount: number;
  readonly totalDurationS: number;
  readonly flights: readonly FlightDto[];
}

/** How many flights one bulk change may touch — a long season's logbook. */
export const MAX_FLIGHTS_PER_UPDATE = 1000;

/**
 * What a flight was flown on. Each key is optional: absent leaves it as it
 * is, null clears it, an id sets it.
 */
const flightAssignment = z.object({
  buildId: z.union([z.uuid(), z.null()]).optional(),
  batteryUnitId: z.union([z.uuid(), z.null()]).optional(),
});

const changesSomething = (change: z.infer<typeof flightAssignment>): boolean =>
  change.buildId !== undefined || change.batteryUnitId !== undefined;

const NOTHING_TO_CHANGE = 'Say which build or battery pack to set';

/** Changing one flight's build or battery pack. */
export const updateFlightSchema = flightAssignment.refine(changesSomething, NOTHING_TO_CHANGE);
export type UpdateFlightDto = z.infer<typeof updateFlightSchema>;

/** The same change, applied to many flights at once. */
export const updateFlightsSchema = flightAssignment
  .extend({
    flightIds: z
      .array(z.uuid())
      .min(1, 'Choose at least one flight')
      .max(MAX_FLIGHTS_PER_UPDATE, `Change at most ${MAX_FLIGHTS_PER_UPDATE} flights at once`),
  })
  .refine(changesSomething, NOTHING_TO_CHANGE);
export type UpdateFlightsDto = z.infer<typeof updateFlightsSchema>;

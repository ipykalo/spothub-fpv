import { LogFormat, SESSION_GAP_MINUTES } from '@spothub/shared';

/** Flights further apart than this start a new session. */
export const SESSION_GAP_MS = SESSION_GAP_MINUTES * 60_000;

/** The job that parses one batch of uploaded logs. */
export const FLIGHT_LOG_IMPORT_JOB = 'flight-log.import';

/** What each format is stored and signed as. Part of the presigned PUT's signature. */
export const LOG_CONTENT_TYPES: Readonly<Record<LogFormat, string>> = {
  [LogFormat.EdgetxCsv]: 'text/csv',
  [LogFormat.BetaflightBbl]: 'application/octet-stream',
};

/** The extension a stored log's key ends in. */
export const LOG_EXTENSIONS: Readonly<Record<LogFormat, string>> = {
  [LogFormat.EdgetxCsv]: '.csv',
  [LogFormat.BetaflightBbl]: '.bbl',
};

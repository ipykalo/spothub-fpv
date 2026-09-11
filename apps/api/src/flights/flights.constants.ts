import { SESSION_GAP_MINUTES } from '@spothub/shared';

/** Flights further apart than this start a new session. */
export const SESSION_GAP_MS = SESSION_GAP_MINUTES * 60_000;

/** The job that parses one batch of uploaded logs. */
export const FLIGHT_LOG_IMPORT_JOB = 'flight-log.import';

/** What a log is stored and signed as. Part of the presigned PUT's signature. */
export const LOG_CONTENT_TYPE = 'text/csv';

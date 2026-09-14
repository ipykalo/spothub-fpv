import { SESSION_GAP_MINUTES } from '@spothub/shared';

/** Flights further apart than this start a new session. */
export const SESSION_GAP_MS = SESSION_GAP_MINUTES * 60_000;

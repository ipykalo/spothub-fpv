import { Throttle } from '@nestjs/throttler';

import { MINUTE_MS } from '../guards/rate-limit.guard';

/**
 * Routes whose limits differ from the defaults in `RATE_LIMITS`, all in one
 * table so they can be read, and compared, together. Each is per route, per
 * pilot (or per address for a visitor), per minute.
 */
const ROUTE_LIMITS = {
  /** Google sign-in and its callback: nobody signs in ten times a minute. */
  signIn: { default: { limit: 10, ttl: MINUTE_MS } },
  /** A new question, reply or comment — what lands in other pilots' unread counts. */
  comment: { writes: { limit: 10, ttl: MINUTE_MS } },
  /** The one route where the server opens an address someone else chose. */
  urlPreview: { writes: { limit: 20, ttl: MINUTE_MS } },
  /** A photo or post image: one signature per file, each a real upload. */
  imageUpload: { writes: { limit: 30, ttl: MINUTE_MS } },
  /**
   * A flight log. Looser, not stricter: a radio's LOGS folder signs one file
   * after another, and a first import can be hundreds of small files. The
   * storage limit is what bounds it.
   */
  logUpload: { writes: { limit: 600, ttl: MINUTE_MS } },
} as const;

export type RouteLimit = keyof typeof ROUTE_LIMITS;

/** Applies one of `ROUTE_LIMITS` to a route. */
export const RateLimit = (kind: RouteLimit): MethodDecorator & ClassDecorator =>
  Throttle(ROUTE_LIMITS[kind]);

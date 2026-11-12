import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

/**
 * The routes whose limit differs from the defaults. Each one's number is
 * an environment variable (`RATE_LIMIT_*` in `env.schema.ts`), and which
 * default it takes the place of is in `ROUTE_LIMITS` beside the guard.
 */
export type RouteLimit =
  'signIn' | 'comment' | 'urlPreview' | 'imageUpload' | 'logUpload';

/** Puts a route under one of the `RouteLimit`s instead of the default. */
export const RateLimit = (kind: RouteLimit): MethodDecorator & ClassDecorator =>
  SetMetadata(RATE_LIMIT_KEY, kind);

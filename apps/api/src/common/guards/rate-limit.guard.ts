import { type ExecutionContext, Injectable } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  type ThrottlerLimitDetail,
  type ThrottlerOptions,
  ThrottlerGuard,
} from '@nestjs/throttler';
import type { Request, Response } from 'express';

import type { Env } from '../../config';
import { RATE_LIMIT_KEY, type RouteLimit } from '../decorators/rate-limit.decorator';
import type { AuthenticatedUser } from '../types/authenticated-user';

const MINUTE_MS = 60_000;

const READS = new Set(['GET', 'HEAD', 'OPTIONS']);

type Base = 'default' | 'writes';

/**
 * Each route limit: the variable that sets it, and the default it takes the
 * place of on its route — a sign-in is counted instead of every request, a
 * comment instead of every write.
 */
const ROUTE_LIMITS: Record<
  RouteLimit,
  { readonly env: keyof Env; readonly replaces: Base }
> = {
  signIn: { env: 'RATE_LIMIT_SIGN_IN', replaces: 'default' },
  comment: { env: 'RATE_LIMIT_COMMENTS', replaces: 'writes' },
  urlPreview: { env: 'RATE_LIMIT_URL_PREVIEW', replaces: 'writes' },
  imageUpload: { env: 'RATE_LIMIT_IMAGE_UPLOADS', replaces: 'writes' },
  logUpload: { env: 'RATE_LIMIT_LOG_UPLOADS', replaces: 'writes' },
};

const reflector = new Reflector();

/** Which route limit, if any, `@RateLimit` put this route under. */
function routeLimitOf(context: ExecutionContext): RouteLimit | undefined {
  return reflector.getAllAndOverride<RouteLimit | undefined>(RATE_LIMIT_KEY, [
    context.getHandler(),
    context.getClass(),
  ]);
}

function replaced(context: ExecutionContext, base: Base): boolean {
  const kind = routeLimitOf(context);
  return kind !== undefined && ROUTE_LIMITS[kind].replaces === base;
}

/**
 * Every limit, each counted per route and per caller over a minute, with its
 * number from the environment (`RATE_LIMIT_*`), so changing one is a restart
 * rather than a release. `default` counts every request; `writes` only the
 * ones that change something, which is where abuse costs — rows, storage,
 * other pilots' notifications. A route under `@RateLimit(...)` is counted by
 * its own limit instead of the default that limit replaces.
 */
export function rateLimits(config: ConfigService<Env, true>): {
  throttlers: ThrottlerOptions[];
  errorMessage: string;
} {
  const limit = (name: keyof Env): number => config.get<number>(name);

  const routes: ThrottlerOptions[] = (
    Object.entries(ROUTE_LIMITS) as [RouteLimit, (typeof ROUTE_LIMITS)[RouteLimit]][]
  ).map(([kind, { env }]) => ({
    name: kind,
    ttl: MINUTE_MS,
    limit: limit(env),
    skipIf: (context: ExecutionContext) => routeLimitOf(context) !== kind,
  }));

  return {
    throttlers: [
      {
        name: 'default',
        ttl: MINUTE_MS,
        limit: limit('RATE_LIMIT_REQUESTS'),
        skipIf: (context: ExecutionContext) => replaced(context, 'default'),
      },
      {
        name: 'writes',
        ttl: MINUTE_MS,
        limit: limit('RATE_LIMIT_WRITES'),
        skipIf: (context: ExecutionContext) =>
          READS.has(context.switchToHttp().getRequest<Request>().method) ||
          replaced(context, 'writes'),
      },
      ...routes,
    ],
    errorMessage: 'Too many requests. Wait a minute and try again.',
  };
}

/**
 * Registered globally after `JwtAuthGuard`, so a signed-in pilot is already
 * known and is counted as themselves wherever they connect from; a visitor —
 * or a request whose token did not verify — is counted by address. The
 * address is `request.ip`, which behind Caddy is the visitor's own
 * (`TRUST_PROXY_HOPS`), and for a page the client server renders is the
 * visitor's too, forwarded by `serverApiInterceptor`.
 */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected override getTracker(request: Request): Promise<string> {
    const user = request.user as AuthenticatedUser | undefined;

    return Promise.resolve(user ? `user:${user.id}` : `ip:${request.ip ?? 'unknown'}`);
  }

  /**
   * The library names the header after the limit that refused —
   * `Retry-After-writes` — which nothing reads. The standard one says when
   * to come back, in seconds.
   */
  protected override throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    context
      .switchToHttp()
      .getResponse<Response>()
      .header('Retry-After', String(detail.timeToBlockExpire));

    return super.throwThrottlingException(context, detail);
  }
}

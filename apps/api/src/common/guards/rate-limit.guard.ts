import { type ExecutionContext, Injectable } from '@nestjs/common';
import {
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
  ThrottlerGuard,
} from '@nestjs/throttler';
import type { Request, Response } from 'express';

import type { AuthenticatedUser } from '../types/authenticated-user';

export const MINUTE_MS = 60_000;

const READS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * The limits every route has, counted per route and per caller, each over a
 * minute. `default` counts every request; `writes` counts only the ones that
 * change something, which is where abuse costs us — rows, storage, other
 * pilots' notifications. A route that needs tighter or looser limits says so
 * with `@RateLimit(...)`, and the table of those lives beside it.
 */
export const RATE_LIMITS: ThrottlerModuleOptions = {
  throttlers: [
    { name: 'default', ttl: MINUTE_MS, limit: 300 },
    {
      name: 'writes',
      ttl: MINUTE_MS,
      limit: 60,
      skipIf: (context: ExecutionContext) =>
        READS.has(context.switchToHttp().getRequest<Request>().method),
    },
  ],
  errorMessage: 'Too many requests. Wait a minute and try again.',
};

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

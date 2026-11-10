import { type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import type { Observable } from 'rxjs';

import { UserStatus } from '@spothub/shared';

import { ALLOWED_WHEN_READ_ONLY_KEY } from '../decorators/allowed-when-read-only.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Registered globally, so routes are protected by default and opting out is an
 * explicit `@Public()`. The inverse — remembering to guard each new route —
 * fails silently the first time someone forgets.
 *
 * A public route still recognises a signed-in viewer: when a bearer token is
 * sent it is checked, and a valid one attaches the user as on any other route.
 * That is what lets a public build page answer "yours" to its owner. A missing
 * or invalid token is never an error there; the request goes on as a visitor.
 *
 * A read-only account is refused every write here too, in one place, rather
 * than in each of forty handlers: anything but GET, HEAD or OPTIONS answers
 * 403 unless the route is marked `@AllowedWhenReadOnly()`.
 */
/** What a read-only account may still do. */
const READS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    return isPublic ? this.recogniseIfSignedIn(context) : this.authenticate(context);
  }

  private async authenticate(context: ExecutionContext): Promise<boolean> {
    await (super.canActivate(context) as Promise<boolean>);

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;

    if (
      user?.status === UserStatus.Restricted &&
      !READS.has(request.method) &&
      !this.reflector.getAllAndOverride<boolean>(ALLOWED_WHEN_READ_ONLY_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      throw new ForbiddenException('This account is read-only');
    }

    return true;
  }

  private async recogniseIfSignedIn(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    if (request.headers.authorization) {
      try {
        await (super.canActivate(context) as Promise<boolean>);
      } catch {
        // An expired or forged token on a public route: carry on as a visitor.
      }
    }

    return true;
  }
}

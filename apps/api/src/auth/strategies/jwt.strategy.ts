import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UserStatus } from '@spothub/shared';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { Env } from '../../config';
import type { AuthenticatedUser } from '../../common';
import type { AccessTokenPayload } from '../auth.types';
import { RefreshTokenRepository } from '../abstract/refresh-token.repository';
import { UsersFacade } from '../../users';

/**
 * Validates the bearer access token on every guarded request.
 *
 * The user is re-read from the database rather than trusted from the claims, so
 * a deleted account cannot keep acting for the remaining life of its token.
 * And the token's session must still stand, so signing out — here, on every
 * device, or by a stolen cookie being caught — ends its access tokens at
 * once, not when their 15 minutes run out.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService<Env, true>,
    private readonly users: UsersFacade,
    private readonly sessions: RefreshTokenRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_ACCESS_SECRET', { infer: true }),
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    // A token from before sessions were named has no `sid`: refused, and the
    // client's refresh hands it one that does.
    if (typeof payload.sid !== 'string') {
      throw new UnauthorizedException('Sign in again');
    }

    const [user, live] = await Promise.all([
      this.users.findById(payload.sub),
      this.sessions.isSessionLive(payload.sub, payload.sid),
    ]);

    if (!live) {
      throw new UnauthorizedException('Signed out');
    }

    if (!user) {
      throw new UnauthorizedException('Account no longer exists');
    }

    // Checked here, on every request, so blocking someone takes effect at
    // once rather than when their access token runs out.
    if (user.status === UserStatus.Blocked) {
      throw new UnauthorizedException('This account has been blocked');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      homeCurrency: user.homeCurrency,
    };
  }
}

import { createHash, randomUUID } from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import type { UserEntity } from '../../users';
import type { Env } from '../../config';
import type { AccessTokenPayload, RefreshTokenPayload } from '../auth.types';
import { RefreshTokenRepository } from '../abstract/refresh-token.repository';

export interface IssuedTokens {
  readonly accessToken: string;
  readonly accessTokenTtl: number;
  readonly refreshToken: string;
  readonly refreshTokenTtl: number;
  /** Id of the stored row, equal to the token's `jti` claim. */
  readonly refreshTokenId: string;
}

/**
 * Issues, rotates and revokes tokens. It knows nothing about HTTP, cookies or
 * Google — those belong to the controller and the strategies respectively.
 */
@Injectable()
export class TokenService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessTtl: number;
  private readonly refreshTtl: number;
  private readonly sessionMaxTtl: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly refreshTokens: RefreshTokenRepository,
    config: ConfigService<Env, true>,
  ) {
    this.accessSecret = config.get('JWT_ACCESS_SECRET', { infer: true });
    this.refreshSecret = config.get('JWT_REFRESH_SECRET', { infer: true });
    this.accessTtl = config.get('JWT_ACCESS_TTL', { infer: true });
    this.refreshTtl = config.get('JWT_REFRESH_TTL', { infer: true });
    this.sessionMaxTtl = config.get('JWT_SESSION_MAX_TTL', { infer: true });
  }

  /** Starts a new token family. Called once per successful login. */
  issueForLogin(user: UserEntity): Promise<IssuedTokens> {
    return this.issue(user, randomUUID(), nowSeconds());
  }

  /**
   * Exchanges a refresh token for a new pair.
   *
   * Presenting a token that has already been rotated means the cookie leaked
   * and is being replayed, so the entire family is revoked rather than just
   * that link — the legitimate holder is logged out too, which is the point.
   *
   * A session older than JWT_SESSION_MAX_TTL is over, however recently it was
   * used: its family is revoked and the pilot signs in with Google again.
   */
  async rotate(
    rawToken: string,
    loadUser: (id: string) => Promise<UserEntity | null>,
  ): Promise<IssuedTokens> {
    const payload = await this.verifyRefreshToken(rawToken);
    const stored = await this.refreshTokens.findById(payload.jti);

    if (stored?.tokenHash !== TokenService.hash(rawToken)) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.revokedAt) {
      await this.refreshTokens.revokeFamily(stored.familyId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const started = payload.started ?? nowSeconds();

    if (nowSeconds() - started >= this.sessionMaxTtl) {
      await this.refreshTokens.revokeFamily(stored.familyId);
      throw new UnauthorizedException('Session expired; sign in again');
    }

    const user = await loadUser(stored.userId);

    if (!user) {
      await this.refreshTokens.revokeFamily(stored.familyId);
      throw new UnauthorizedException('Account no longer exists');
    }

    const next = await this.issue(user, stored.familyId, started);
    await this.refreshTokens.markRotated(stored.id, next.refreshTokenId);

    return next;
  }

  /** Every session the user has, on every device, ends here. */
  revokeAllFor(userId: string): Promise<void> {
    return this.refreshTokens.revokeAllForUser(userId);
  }

  async revokeFamilyOf(rawToken: string): Promise<void> {
    const payload = await this.verifyRefreshToken(rawToken).catch(() => null);

    if (payload) {
      await this.refreshTokens.revokeFamily(payload.family);
    }
  }

  private async issue(
    user: UserEntity,
    familyId: string,
    started: number,
  ): Promise<IssuedTokens> {
    const jti = randomUUID();
    // Another JWT_REFRESH_TTL, but never past the session's own end — so the
    // token, its stored row and the cookie all run out together.
    const refreshTtl = Math.min(
      this.refreshTtl,
      started + this.sessionMaxTtl - nowSeconds(),
    );

    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      sid: familyId,
    };

    const refreshPayload: RefreshTokenPayload = {
      sub: user.id,
      jti,
      family: familyId,
      started,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, {
        secret: this.accessSecret,
        expiresIn: this.accessTtl,
      }),
      this.jwt.signAsync(refreshPayload, {
        secret: this.refreshSecret,
        expiresIn: refreshTtl,
      }),
    ]);

    await this.refreshTokens.store({
      id: jti,
      userId: user.id,
      tokenHash: TokenService.hash(refreshToken),
      familyId,
      expiresAt: new Date(Date.now() + refreshTtl * 1000),
    });

    return {
      accessToken,
      accessTokenTtl: this.accessTtl,
      refreshToken,
      refreshTokenTtl: refreshTtl,
      refreshTokenId: jti,
    };
  }

  private async verifyRefreshToken(rawToken: string): Promise<RefreshTokenPayload> {
    try {
      return await this.jwt.verifyAsync<RefreshTokenPayload>(rawToken, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /** Only the hash is stored; the raw token exists solely in the cookie. */
  private static hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

import { createHash, randomUUID } from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import type { UserEntity } from '../users/user.entity';
import type { Env } from '../config/env.schema';
import type { AccessTokenPayload, RefreshTokenPayload } from './auth.types';
import { RefreshTokenRepository } from './refresh-token.repository';

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

  constructor(
    private readonly jwt: JwtService,
    private readonly refreshTokens: RefreshTokenRepository,
    config: ConfigService<Env, true>,
  ) {
    this.accessSecret = config.get('JWT_ACCESS_SECRET', { infer: true });
    this.refreshSecret = config.get('JWT_REFRESH_SECRET', { infer: true });
    this.accessTtl = config.get('JWT_ACCESS_TTL', { infer: true });
    this.refreshTtl = config.get('JWT_REFRESH_TTL', { infer: true });
  }

  /** Starts a new token family. Called once per successful login. */
  issueForLogin(user: UserEntity): Promise<IssuedTokens> {
    return this.issue(user, randomUUID());
  }

  /**
   * Exchanges a refresh token for a new pair.
   *
   * Presenting a token that has already been rotated means the cookie leaked
   * and is being replayed, so the entire family is revoked rather than just
   * that link — the legitimate holder is logged out too, which is the point.
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

    const user = await loadUser(stored.userId);

    if (!user) {
      await this.refreshTokens.revokeFamily(stored.familyId);
      throw new UnauthorizedException('Account no longer exists');
    }

    const next = await this.issue(user, stored.familyId);
    await this.refreshTokens.markRotated(stored.id, next.refreshTokenId);

    return next;
  }

  async revokeFamilyOf(rawToken: string): Promise<void> {
    const payload = await this.verifyRefreshToken(rawToken).catch(() => null);

    if (payload) {
      await this.refreshTokens.revokeFamily(payload.family);
    }
  }

  private async issue(user: UserEntity, familyId: string): Promise<IssuedTokens> {
    const jti = randomUUID();

    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const refreshPayload: RefreshTokenPayload = {
      sub: user.id,
      jti,
      family: familyId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, {
        secret: this.accessSecret,
        expiresIn: this.accessTtl,
      }),
      this.jwt.signAsync(refreshPayload, {
        secret: this.refreshSecret,
        expiresIn: this.refreshTtl,
      }),
    ]);

    await this.refreshTokens.store({
      id: jti,
      userId: user.id,
      tokenHash: TokenService.hash(refreshToken),
      familyId,
      expiresAt: new Date(Date.now() + this.refreshTtl * 1000),
    });

    return {
      accessToken,
      accessTokenTtl: this.accessTtl,
      refreshToken,
      refreshTokenTtl: this.refreshTtl,
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

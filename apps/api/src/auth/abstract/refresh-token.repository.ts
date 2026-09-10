import type { RefreshTokenEntity } from '../refresh-token.entity';

export interface StoreRefreshTokenInput {
  /** Must equal the token's `jti` claim — that is how rotation finds the row. */
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly familyId: string;
  readonly expiresAt: Date;
}

/** Persistence contract for issued refresh tokens. */
export abstract class RefreshTokenRepository {
  abstract store(input: StoreRefreshTokenInput): Promise<void>;

  abstract findById(id: string): Promise<RefreshTokenEntity | null>;

  /** Marks one token as rotated, pointing at its successor. */
  abstract markRotated(id: string, replacedById: string): Promise<void>;

  /** Revokes every live token descended from one login. */
  abstract revokeFamily(familyId: string): Promise<void>;

  abstract revokeAllForUser(userId: string): Promise<void>;

  /** Housekeeping for expired rows. Safe to call from a cron. */
  abstract deleteExpired(now: Date): Promise<number>;
}

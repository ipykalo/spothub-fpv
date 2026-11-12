import type { Role } from '@spothub/shared';

/** Claims carried by the short-lived access token. */
export interface AccessTokenPayload {
  /** Subject — the user id. */
  readonly sub: string;
  readonly email: string;
  readonly role: Role;
}

/** Claims carried by the refresh token. `jti` identifies the stored row. */
export interface RefreshTokenPayload {
  readonly sub: string;
  readonly jti: string;
  readonly family: string;
  /**
   * When the session began — the Google sign-in — in seconds since the epoch.
   * Carried from token to token on every rotation, and signed with the rest,
   * so no rotation can extend it. Absent on tokens issued before the limit
   * existed: their clock starts at their next refresh.
   */
  readonly started?: number;
}

/** The profile fields taken from Google. */
export interface GoogleProfile {
  /** Google's stable subject id. Keyed on rather than the email. */
  readonly subject: string;
  readonly email: string;
  /**
   * Whether Google has confirmed the address belongs to this account. An
   * unverified one is refused: admission matches on the email, and so does
   * linking a new identity to an existing account.
   */
  readonly emailVerified: boolean;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
}

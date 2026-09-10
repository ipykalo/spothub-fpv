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
}

/** The profile fields taken from Google. */
export interface GoogleProfile {
  /** Google's stable subject id. Keyed on rather than the email. */
  readonly subject: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
}

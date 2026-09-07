/** An issued refresh token, as the domain sees it. */
export interface RefreshTokenEntity {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly familyId: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

import type { Role, UserStatus } from '@spothub/shared';

/**
 * The user as the domain understands it.
 *
 * Deliberately not Prisma's generated `User`: services and repository contracts
 * depend on this, so swapping the persistence layer touches only the
 * `prisma-*.repository.ts` implementations (DIP).
 */
export interface UserEntity {
  readonly id: string;
  readonly email: string;
  /** The full name from Google. Only the pilot and an admin ever see it. */
  readonly displayName: string | null;
  /** The name they chose to go by; null goes by the short form of `displayName`. */
  readonly pilotName: string | null;
  /** One of `CURRENCIES`: what their totals are shown in, besides USD. */
  readonly homeCurrency: string;
  readonly avatarUrl: string | null;
  readonly role: Role;
  readonly status: UserStatus;
  readonly createdAt: Date;
  readonly lastSignInAt: Date | null;
  /** Their own storage limit; null follows the default in the settings. */
  readonly storageQuotaBytes: number | null;
  /** ISO code of the country their last sign-in came from, refused or not. */
  readonly lastSignInCountry: string | null;
}

/** What an admin may change about a pilot. Only the keys present are written. */
export interface UpdateUserAdminData {
  readonly status?: UserStatus;
  readonly storageQuotaBytes?: number | null;
}

export const AuthProviderKind = {
  Google: 'GOOGLE',
  Discord: 'DISCORD',
} as const;
export type AuthProviderKind = (typeof AuthProviderKind)[keyof typeof AuthProviderKind];

/** A federated identity being linked to a user. */
export interface LinkIdentityInput {
  readonly provider: AuthProviderKind;
  readonly subject: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  /** ISO code of the country this sign-in comes from; null when unknown. */
  readonly country: string | null;
}

/** A pilot's posts, as the Admin page counts them. */
export interface PostCounts {
  readonly posts: number;
  readonly hidden: number;
}

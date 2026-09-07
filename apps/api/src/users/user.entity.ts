import type { Role } from '@spothub/shared';

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
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly role: Role;
}

export const AuthProviderKind = {
  Google: 'GOOGLE',
  Discord: 'DISCORD',
} as const;
export type AuthProviderKind = (typeof AuthProviderKind)[keyof typeof AuthProviderKind];

import type { AuthProviderKind, UserEntity } from './user.entity';

export interface LinkIdentityInput {
  readonly provider: AuthProviderKind;
  readonly subject: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
}

/**
 * The persistence contract for users.
 *
 * Declared as an abstract class so it doubles as the injection token — no
 * string tokens, and the service depends on this abstraction rather than on
 * Prisma.
 */
export abstract class UsersRepository {
  abstract findById(id: string): Promise<UserEntity | null>;

  abstract findByProviderSubject(
    provider: AuthProviderKind,
    subject: string,
  ): Promise<UserEntity | null>;

  /**
   * Finds the user behind a federated identity, creating the user and/or
   * linking the identity as needed. Idempotent: signing in twice is one user.
   */
  abstract upsertFromIdentity(input: LinkIdentityInput): Promise<UserEntity>;
}

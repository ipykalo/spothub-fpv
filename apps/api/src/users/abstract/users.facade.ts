import type { LinkIdentityInput, UserEntity } from '../user.entity';

/**
 * The users module's public API — the only thing another module may inject.
 *
 * Deliberately narrower than `UsersRepository`: auth may resolve a user and
 * link an identity, and nothing else. `findByProviderSubject` stays private to
 * this module, and a method added to the repository tomorrow is not published
 * by default.
 */
export abstract class UsersFacade {
  abstract findById(id: string): Promise<UserEntity | null>;

  /**
   * Finds the user behind a federated identity, creating the user and/or
   * linking the identity as needed. Idempotent: signing in twice is one user.
   */
  abstract upsertFromIdentity(input: LinkIdentityInput): Promise<UserEntity>;
}

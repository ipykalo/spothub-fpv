import type { StorageUsageDto } from '@spothub/shared';

import type { LinkIdentityInput, UserEntity } from '../user.entity';

/**
 * The users module's public API — the only thing another module may inject.
 *
 * Deliberately narrower than `UsersRepository`: auth may resolve a user and
 * link an identity, and the modules that store files may ask how much room a
 * pilot has left. Nothing else. `findByProviderSubject` stays private to
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

  /** How much of their storage this pilot has used, and how much they may. */
  abstract storageUsage(userId: string): Promise<StorageUsageDto>;

  /**
   * Refuses, with 413 and a readable message, an upload of `bytes` that would
   * take this pilot past their limit. Asked by `media` and `flight-logs`
   * before they sign an upload.
   */
  abstract assertCanStore(userId: string, bytes: number): Promise<void>;

  /**
   * Deletes the account, every row it owns and every file it stored. The
   * only admin is refused, so the site cannot be left without one.
   */
  abstract deleteAccount(userId: string): Promise<void>;
}

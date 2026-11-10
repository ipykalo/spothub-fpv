import type {
  AuthProviderKind,
  LinkIdentityInput,
  UpdateUserAdminData,
  UserEntity,
} from '../user.entity';

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

  /**
   * Every account, oldest first, for the Admin page. Not owner-scoped: who
   * may list them is checked by role before this is asked.
   */
  abstract findAll(): Promise<UserEntity[]>;

  /** Null when there is no such user. */
  abstract updateAdminFields(
    id: string,
    data: UpdateUserAdminData,
  ): Promise<UserEntity | null>;

  /**
   * What each of these pilots keeps in storage, in bytes: photos, post
   * images and flight logs. An upload signed but never finished counts for a
   * day: long enough to stop a burst of requests racing past the limit, short
   * enough that an abandoned one does not hold space for ever. A pilot with
   * nothing stored is absent from the map.
   */
  abstract storageUsedBy(ids: readonly string[]): Promise<ReadonlyMap<string, number>>;

  /** The pilot's own name for the site; null clears it. Null when there is no such user. */
  abstract setPilotName(id: string, pilotName: string | null): Promise<UserEntity | null>;

  /** The currency their totals are shown in. Null when there is no such user. */
  abstract setHomeCurrency(id: string, homeCurrency: string): Promise<UserEntity | null>;

  abstract countAdmins(): Promise<number>;

  /**
   * Deletes the account. Every row it owns — builds, parts, flights, logs,
   * spots, posts, comments, likes, sessions — cascades from it in the
   * database. False when there was no such user.
   */
  abstract delete(id: string): Promise<boolean>;
}

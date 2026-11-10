/**
 * The settings module's public API — the only thing another module may inject.
 * Consumed by `auth`, which asks it at every sign-in, and by `users`, for the
 * default storage limit.
 */
export abstract class SettingsFacade {
  /**
   * Whether this address may sign in, by the settings as they stand now — so
   * a change on the Admin page applies to the next sign-in, with no restart.
   */
  abstract permitsSignIn(email: string): Promise<boolean>;

  /** What a pilot without a limit of their own may keep in storage. */
  abstract defaultStorageQuotaBytes(): Promise<number>;
}

/**
 * The settings module's public API — the only thing another module may inject.
 * Consumed by `auth`, which asks it at every sign-in.
 */
export abstract class SettingsFacade {
  /**
   * Whether this address may sign in, by the settings as they stand now — so
   * a change on the Admin page applies to the next sign-in, with no restart.
   */
  abstract permitsSignIn(email: string): Promise<boolean>;
}

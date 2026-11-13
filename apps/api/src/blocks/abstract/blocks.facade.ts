/**
 * The blocks module's public API — the only thing another module may inject.
 *
 * `comments` asks it two things: whom a reader blocked, so their comments are
 * left out of what that reader sees, and whether a subject's owner blocked
 * the pilot about to comment on it.
 */
export abstract class BlocksFacade {
  /** Everyone this pilot blocked. Empty for a signed-out visitor. */
  abstract blockedBy(blockerId: string | null): Promise<ReadonlySet<string>>;

  abstract isBlocked(blockerId: string, blockedId: string): Promise<boolean>;
}

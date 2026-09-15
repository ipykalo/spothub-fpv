import type { BuildDto } from '@spothub/shared';

/**
 * The builds module's public API — the only thing another module may inject.
 *
 * Narrow on purpose. `comments` needs to know whether someone may open a build
 * and whose it is, so it can decide who may ask, delete or mark an answer;
 * `posts` needs to check the builds a post links are its author's, and to show
 * a reader the ones they may open. Neither ever changes a build.
 */
export abstract class BuildsFacade {
  /** Which of these builds belong to the owner. Ids that are not theirs, or not builds, are absent. */
  abstract idsOwnedBy(ownerId: string, buildIds: readonly string[]): Promise<ReadonlySet<string>>;

  /**
   * The builds among these the viewer may open — their own, or shared as
   * Public or Unlisted; a null viewer is a signed-out visitor — as cards with
   * their covers, in the order asked. The rest are left out without a word.
   */
  abstract visibleToViewer(
    viewerId: string | null,
    buildIds: readonly string[],
  ): Promise<BuildDto[]>;

  /**
   * The build's owner, when the viewer may open the build — their own, or one
   * shared as Public or Unlisted; a null viewer is a signed-out visitor, who
   * may open only the shared ones. Null when it does not exist or is not
   * theirs to see, which a caller should report exactly as "not found".
   */
  abstract ownerIfVisible(viewerId: string | null, buildId: string): Promise<string | null>;
}

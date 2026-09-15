/**
 * The builds module's public API — the only thing another module may inject.
 *
 * Narrow on purpose. `comments` needs to know whether someone may open a build
 * and whose it is, so it can decide who may ask, delete or mark an answer; it
 * never reads or changes the build itself.
 */
export abstract class BuildsFacade {
  /**
   * The build's owner, when the viewer may open the build — their own, or one
   * shared with them. Null when it does not exist or is not theirs to see,
   * which a caller should report exactly as "not found".
   */
  abstract ownerIfVisible(viewerId: string, buildId: string): Promise<string | null>;
}

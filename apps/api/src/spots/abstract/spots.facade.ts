/**
 * The spots module's public API — the only thing another module may inject.
 *
 * Narrow on purpose. `spot-comments` needs to know whether someone may open a
 * spot and whose it is, so it can decide who may ask, delete or mark an
 * answer; it never reads or changes the spot itself.
 */
export abstract class SpotsFacade {
  /**
   * The spot's owner, when the viewer may open the spot — their own, or one
   * shared with them. Null when it does not exist or is not theirs to see,
   * which a caller should report exactly as "not found".
   */
  abstract ownerIfVisible(viewerId: string, spotId: string): Promise<string | null>;
}

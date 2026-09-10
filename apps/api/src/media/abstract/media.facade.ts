/**
 * The media module's public API — the only thing another module may inject.
 *
 * It exists so `builds` can put a cover photo on a build card without knowing
 * that assets live in S3, are addressed by storage key, or are served through
 * a signature. Media depends on no feature module, so this edge is safe.
 */
export abstract class MediaFacade {
  /**
   * Presigned GET URLs for the given assets, keyed by asset id.
   *
   * Batched, because the builds list needs one per card and signing is a local
   * computation — the round trip is the database lookup, and this makes it one.
   * Ids that are not the owner's are simply absent from the result.
   *
   * The URLs expire. They are for rendering now, never for storing.
   */
  abstract urlsFor(
    ownerId: string,
    assetIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>>;
}

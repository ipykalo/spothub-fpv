import type { PostImageDto } from '@spothub/shared';

/**
 * The media module's public API — the only thing another module may inject.
 *
 * It exists so `builds` can put a cover photo on a build card, and `posts` can
 * show a post's images, without knowing that assets live in S3, are addressed
 * by storage key, or are served through a signature. Media depends on no
 * feature module, so these edges are safe.
 *
 * A build's URLs expire: they are for rendering now, never for storing. A
 * post's images are different — they are public reading, so they carry a
 * lasting address that the API redirects to storage per request.
 */
export abstract class MediaFacade {
  /**
   * Presigned GET URLs for the given assets, keyed by asset id.
   *
   * Batched, because the builds list needs one per card and signing is a local
   * computation — the round trip is the database lookup, and this makes it one.
   * Ids that are not the owner's are simply absent from the result.
   */
  abstract urlsFor(
    ownerId: string,
    assetIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>>;

  /** The same, for each asset's thumbnail — or the original where there is none. */
  abstract thumbUrlsFor(
    ownerId: string,
    assetIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>>;

  /**
   * The images uploaded to a post, in upload order. Whether the reader may see
   * the post is the caller's check; this answers for the author's own images.
   */
  abstract postImages(authorId: string, postId: string): Promise<PostImageDto[]>;

  /**
   * Deletes a post's images, rows and stored objects, except those in `keep`.
   * With nothing kept, it is what deleting the post needs.
   */
  abstract deletePostImages(
    authorId: string,
    postId: string,
    keep: readonly string[],
  ): Promise<void>;
}

/**
 * The posts module's public API — the only thing another module may inject.
 *
 * Narrow on purpose: `comments` needs to know whether someone may open a post
 * and who wrote it, so it can decide who may comment and delete. It never
 * changes a post.
 */
export abstract class PostsFacade {
  /**
   * The post's author, when the viewer may open the post — their own, or one
   * shared as Public or Unlisted; a null viewer is a signed-out visitor, who
   * may open only the shared ones. Null when it does not exist or is not
   * theirs to see, which a caller should report exactly as "not found".
   */
  abstract authorIfVisible(
    viewerId: string | null,
    postId: string,
  ): Promise<string | null>;
}

/**
 * The comments module's public API — the only thing another module may inject.
 *
 * Narrow on purpose: `reports` needs to know whether someone may see a
 * comment and who wrote it, so it can take a report about it. It never reads
 * a conversation or changes a comment.
 */
export abstract class CommentsFacade {
  /**
   * The comment's author, when the viewer may open what it is on — the same
   * rule as reading the conversation. Null when it does not exist, is not
   * theirs to see, or is a deleted question's empty placeholder, which a
   * caller should report exactly as "not found".
   */
  abstract authorIfVisible(viewerId: string, commentId: string): Promise<string | null>;
}

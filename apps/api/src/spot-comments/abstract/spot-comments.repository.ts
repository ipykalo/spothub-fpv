import type { CreateSpotCommentData, SpotCommentEntity } from '../spot-comment.entity';

/**
 * Persistence contract for comments on spots.
 *
 * Reads take the spot; the service has already asked `SpotsFacade` whether
 * the viewer may open it. Every write that could touch someone else's words
 * names, in its signature, who is allowed — the author, or the spot's owner —
 * and scopes its query by that, so a stranger's edit or delete cannot be
 * written.
 */
export abstract class SpotCommentsRepository {
  /** Every comment on the spot, oldest first. */
  abstract findManyForSpot(spotId: string): Promise<SpotCommentEntity[]>;

  abstract findOneForSpot(spotId: string, commentId: string): Promise<SpotCommentEntity | null>;

  abstract create(data: CreateSpotCommentData): Promise<SpotCommentEntity>;

  /** Rewords a comment its author wrote. False for anyone else's, or one not on this spot. */
  abstract updateBodyForAuthor(
    authorId: string,
    spotId: string,
    commentId: string,
    body: string,
  ): Promise<boolean>;

  /**
   * Deletes a comment the viewer wrote, or any comment on a spot the viewer
   * owns. A question's replies go with it.
   */
  abstract deleteForViewer(viewerId: string, spotId: string, commentId: string): Promise<boolean>;

  /**
   * Marks a reply as its question's answer — clearing any other answer on
   * that question — or takes the mark back. Only for the spot's owner, and
   * only on a reply: false otherwise.
   */
  abstract setAnswerForSpotOwner(
    ownerId: string,
    spotId: string,
    replyId: string,
    isAnswer: boolean,
  ): Promise<boolean>;

  /** Records that the user has now read everything on the spot. */
  abstract markReadForUser(userId: string, spotId: string): Promise<void>;

  /**
   * Comments by other people on the owner's spots, created since the owner
   * last read each spot, counted per spot. Spots with none are absent.
   */
  abstract countUnreadForOwner(ownerId: string): Promise<ReadonlyMap<string, number>>;
}

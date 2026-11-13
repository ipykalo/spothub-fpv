import type {
  CommentEntity,
  CommentPlacement,
  CreateCommentData,
  HiddenCommentEntity,
  SubjectRef,
  UnreadBySubject,
} from '../comment.entity';

/**
 * Persistence contract for comments on spots and builds.
 *
 * Reads take the subject; the service has already asked the owning module's
 * facade whether the viewer may open it. Every write that could touch someone
 * else's words names, in its signature, who is allowed — the author, the
 * question's asker, or the subject's owner — and scopes its query by that, so
 * a stranger's edit, delete or answer mark cannot be written.
 */
export abstract class CommentsRepository {
  /** Every comment on the subject, oldest first. */
  abstract findManyOn(ref: SubjectRef): Promise<CommentEntity[]>;

  abstract findOneOn(ref: SubjectRef, commentId: string): Promise<CommentEntity | null>;

  /** What a comment is on and who wrote it, found by its id alone. */
  abstract findPlacement(commentId: string): Promise<CommentPlacement | null>;

  abstract create(ref: SubjectRef, data: CreateCommentData): Promise<CommentEntity>;

  /** Rewords a comment its author wrote. False for anyone else's, or one not on this subject. */
  abstract updateBodyForAuthor(
    authorId: string,
    ref: SubjectRef,
    commentId: string,
    body: string,
  ): Promise<boolean>;

  /**
   * Deletes a comment the viewer wrote, or any comment on a subject the viewer
   * owns. The owner's delete takes a question's replies with it; an asker's
   * own question that others replied to is emptied instead, and its replies
   * stay. A deleted question goes for good with its last reply, or when the
   * owner deletes it. False when the viewer may not.
   */
  abstract deleteForViewer(
    viewerId: string,
    ref: SubjectRef,
    commentId: string,
  ): Promise<boolean>;

  /**
   * Marks a reply as its question's answer — clearing any other answer on
   * that question — or takes the mark back. Allowed for whoever asked the
   * question and for the subject's owner, and only on a reply the asker did
   * not write: false otherwise.
   */
  abstract setAnswerForAskerOrOwner(
    viewerId: string,
    ref: SubjectRef,
    replyId: string,
    isAnswer: boolean,
  ): Promise<boolean>;

  /** Records that the user has now read everything on the subject. */
  abstract markReadForUser(userId: string, ref: SubjectRef): Promise<void>;

  /**
   * Comments by other people on the owner's spots and builds, created since
   * the owner last read each, counted per subject. Subjects with none are absent.
   */
  abstract countUnreadForOwner(ownerId: string): Promise<UnreadBySubject>;

  // An admin's reach: not scoped by author or owner, and called only once the
  // service has checked the caller is an admin.

  /** Every comment an admin has hidden, most recently hidden first. */
  abstract findHidden(): Promise<HiddenCommentEntity[]>;

  /** Hides a comment or shows it again. False when there is no such comment with words. */
  abstract setHidden(commentId: string, hidden: boolean): Promise<boolean>;

  /**
   * Deletes any comment, a question's replies with it, as the subject's owner
   * would — and what is left of a deleted question once its last reply goes.
   */
  abstract deleteAny(commentId: string): Promise<boolean>;
}

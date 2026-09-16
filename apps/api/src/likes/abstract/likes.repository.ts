import type { LikeRef, LikeSubject, LikeTally } from '../like.entity';

/**
 * Persistence contract for likes.
 *
 * Whether someone may see the post or build is asked here too, as a join in
 * this repository — the same rule the subject's own page applies — so the
 * likes module depends on no feature module and `posts` and `builds` can ask
 * it for counts without closing a cycle.
 */
export abstract class LikesRepository {
  /** The subject exists and the viewer may open it; a null viewer is a signed-out visitor. */
  abstract subjectVisibleToViewer(
    viewerId: string | null,
    ref: LikeRef,
  ): Promise<boolean>;

  /** Idempotent: liking twice is still one like. */
  abstract addForUser(userId: string, ref: LikeRef): Promise<void>;

  /** Idempotent: taking back a like that is not there changes nothing. */
  abstract removeForUser(userId: string, ref: LikeRef): Promise<void>;

  /**
   * How many have liked each of these subjects, and whether the viewer has.
   * Subjects nobody has liked are absent.
   */
  abstract tallies(
    subject: LikeSubject,
    subjectIds: readonly string[],
    viewerId: string | null,
  ): Promise<ReadonlyMap<string, LikeTally>>;
}

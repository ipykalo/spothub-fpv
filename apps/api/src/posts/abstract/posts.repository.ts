import type {
  CreatePostData,
  PostEntity,
  PostFilter,
  UpdatePostData,
} from '../post.entity';

/**
 * Persistence contract for blog posts.
 *
 * Writes take the author first and are scoped by them, so a post cannot be
 * changed or deleted by anyone else. Reads of someone else's post take the
 * viewer instead — null for a signed-out visitor — and say in their name
 * what they let through.
 */
export abstract class PostsRepository {
  /** The author's own posts, drafts included, most recently changed first. */
  abstract findManyForAuthor(authorId: string): Promise<PostEntity[]>;

  abstract findOneForAuthor(authorId: string, id: string): Promise<PostEntity | null>;

  /**
   * A post the viewer wrote, or one shared as Public or Unlisted. A null
   * viewer is a signed-out visitor, who gets only the shared ones.
   */
  abstract findVisibleForViewer(
    viewerId: string | null,
    id: string,
  ): Promise<PostEntity | null>;

  /** Public posts, newest published first — the blog. */
  abstract findPublished(filter: PostFilter): Promise<PostEntity[]>;

  abstract slugExistsForAuthor(authorId: string, slug: string): Promise<boolean>;

  abstract create(data: CreatePostData): Promise<PostEntity>;

  /** Null when the post is not the author's. */
  abstract updateForAuthor(
    authorId: string,
    id: string,
    data: UpdatePostData,
  ): Promise<PostEntity | null>;

  abstract deleteForAuthor(authorId: string, id: string): Promise<boolean>;

  // An admin's reach: not scoped by author, and called only once the service
  // has checked the caller is an admin.

  /** Any post, whoever wrote it and whatever its visibility. */
  abstract findAnyById(id: string): Promise<PostEntity | null>;

  /** Every post an admin has hidden, most recently hidden first. */
  abstract findHidden(): Promise<PostEntity[]>;

  /** Hides a post or shows it again. False when there is no such post. */
  abstract setHidden(id: string, hidden: boolean): Promise<boolean>;

  /** Hides, or shows again, every post the author wrote; how many changed. */
  abstract setHiddenForAllBy(authorId: string, hidden: boolean): Promise<number>;

  abstract deleteAny(id: string): Promise<boolean>;
}

import type { Visibility } from '@spothub/shared';

/** A blog post as the domain understands it — no ORM types. */
export interface PostEntity {
  readonly id: string;
  readonly authorId: string;
  /** The author's display name, joined from users. Never their email. */
  readonly authorName: string | null;
  readonly title: string;
  readonly slug: string;
  readonly summary: string | null;
  readonly bodyMd: string;
  readonly visibility: Visibility;
  /** When it first left Private; null for a draft that never has. */
  readonly publishedAt: Date | null;
  /** The builds it is about, in the author's order. Not yet checked against any viewer. */
  readonly buildIds: readonly string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Fields the persistence layer accepts on create. */
export interface CreatePostData {
  readonly authorId: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string | null;
  readonly bodyMd: string;
  readonly visibility: Visibility;
  readonly publishedAt: Date | null;
  readonly buildIds: readonly string[];
}

/** A sparse patch. Only the keys present are written; `buildIds` replaces the whole list. */
export type UpdatePostData = Partial<Omit<CreatePostData, 'authorId' | 'slug'>>;

export interface PostFilter {
  /** Only posts about this build. */
  readonly buildId?: string;
}

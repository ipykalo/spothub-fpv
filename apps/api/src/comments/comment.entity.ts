import type { CommentSubject, ReportPlaceKind } from '@spothub/shared';

/** What a conversation hangs off: one spot, build or post. */
export interface SubjectRef {
  readonly subject: CommentSubject;
  readonly subjectId: string;
}

/** A comment as the domain understands it — no ORM types. */
export interface CommentEntity {
  readonly id: string;
  readonly authorId: string;
  /** The author's display name, joined from users. Never their email. */
  readonly authorName: string | null;
  /** Their profile photo's lasting address, or null without one. */
  readonly authorPhotoUrl: string | null;
  /** Null for a question; the question's id for a reply. */
  readonly parentId: string | null;
  readonly body: string;
  readonly isAnswer: boolean;
  readonly editedAt: Date | null;
  /** A question its asker deleted after others replied; its body is already empty. */
  readonly deletedAt: Date | null;
  /** Hidden by an admin: shown to nobody. */
  readonly hiddenAt: Date | null;
  readonly createdAt: Date;
}

/** Where a comment is, and whose it is. */
export interface CommentPlacement {
  readonly ref: SubjectRef;
  readonly authorId: string;
  /** A question its asker deleted after others replied. */
  readonly deleted: boolean;
  /** Hidden by an admin. */
  readonly hidden: boolean;
}

/** A comment an admin hid, with the page it is on, for the Admin page. */
export interface HiddenCommentEntity {
  readonly id: string;
  readonly body: string;
  readonly authorName: string;
  readonly place: {
    readonly kind: ReportPlaceKind;
    readonly id: string;
    /** A post's slug; null for a spot or build. */
    readonly slug: string | null;
  };
  readonly hiddenAt: Date;
}

/** Fields the persistence layer accepts on create. */
export interface CreateCommentData {
  readonly authorId: string;
  readonly parentId: string | null;
  readonly body: string;
}

/** Unread counts per subject id, kept apart for spots, builds and posts. */
export type UnreadBySubject = Readonly<
  Record<CommentSubject, ReadonlyMap<string, number>>
>;

import type { CommentSubject } from '@spothub/shared';

/** What a conversation hangs off: one spot or one build. */
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
  /** Null for a question; the question's id for a reply. */
  readonly parentId: string | null;
  readonly body: string;
  readonly isAnswer: boolean;
  readonly editedAt: Date | null;
  readonly createdAt: Date;
}

/** Fields the persistence layer accepts on create. */
export interface CreateCommentData {
  readonly authorId: string;
  readonly parentId: string | null;
  readonly body: string;
}

/** Unread counts per subject id, kept apart for spots and builds. */
export type UnreadBySubject = Readonly<Record<CommentSubject, ReadonlyMap<string, number>>>;

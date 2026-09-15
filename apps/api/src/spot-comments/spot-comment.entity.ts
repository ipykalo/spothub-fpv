/** A comment as the domain understands it — no ORM types. */
export interface SpotCommentEntity {
  readonly id: string;
  readonly spotId: string;
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
export interface CreateSpotCommentData {
  readonly spotId: string;
  readonly authorId: string;
  readonly parentId: string | null;
  readonly body: string;
}

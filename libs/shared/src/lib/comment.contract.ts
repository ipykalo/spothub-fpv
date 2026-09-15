import { z } from 'zod';

/**
 * Questions and replies, defined once for both sides of the wire — on a spot
 * or on a build, whichever the conversation is about.
 *
 * A question is a comment with no parent; a reply names the question it
 * answers. Replies go one level deep — a conversation about a place or a quad
 * reads as Q&A, not as a tree.
 */

/** What a conversation hangs off. */
export const CommentSubject = {
  Spot: 'SPOT',
  Build: 'BUILD',
} as const;
export type CommentSubject = (typeof CommentSubject)[keyof typeof CommentSubject];

export const MAX_COMMENT_LENGTH = 2000;

const commentBody = z
  .string()
  .trim()
  .min(1, 'Write something first')
  .max(MAX_COMMENT_LENGTH, `Keep it under ${String(MAX_COMMENT_LENGTH)} characters`);

/** A question, or — with `parentId` — a reply to one. */
export const createCommentSchema = z.object({
  body: commentBody,
  parentId: z.uuid().nullable().default(null),
});

/** Only the words change; a comment never moves to another question or subject. */
export const updateCommentSchema = z.object({
  body: commentBody,
});

/** The asker or the subject's owner marks one reply as its question's answer, or takes the mark back. */
export const markAnswerSchema = z.object({
  isAnswer: z.boolean(),
});

export const commentSchema = z.object({
  id: z.uuid(),
  body: z.string(),
  /** The author's display name, or null when they never set one. Never an email. */
  authorName: z.string().nullable(),
  /** Written by the spot's or build's owner — shown as such, since theirs is the answer people want. */
  byOwner: z.boolean(),
  /** Written by the person asking. Only they can edit it. */
  byViewer: z.boolean(),
  /** The person asking may delete it: their own comment, or anything on their own spot or build. */
  canDelete: z.boolean(),
  /** A reply marked as its question's answer, by the asker or the owner. Always false on a question. */
  isAnswer: z.boolean(),
  /**
   * The person asking may mark or unmark this reply as the answer: they asked
   * the question or own the subject, and the reply is not the asker's own — a
   * follow-up or a thank-you never answers the question it follows. Always
   * false on a question.
   */
  canMarkAnswer: z.boolean(),
  createdAt: z.string(),
  editedAt: z.string().nullable(),
});

export const questionSchema = commentSchema.extend({
  /** Oldest first, the order the conversation happened in. */
  replies: z.array(commentSchema),
  /** One of its replies is marked as the answer. */
  answered: z.boolean(),
});

/** Everything said on one spot or build, newest question first. */
export const conversationSchema = z.object({
  questions: z.array(questionSchema),
  /** The person asking owns the spot or build. */
  viewerOwnsSubject: z.boolean(),
});

const unreadCountsSchema = z.object({
  total: z.number().int(),
  /** Subject id to count; one with nothing unread is absent. */
  bySubject: z.record(z.string(), z.number().int()),
});

/**
 * Comments by other people waiting on the viewer's own spots and builds since
 * they last read each — kept apart, because each has its own menu badge.
 */
export const unreadCommentsSchema = z.object({
  spots: unreadCountsSchema,
  builds: unreadCountsSchema,
});

export type CreateCommentDto = z.output<typeof createCommentSchema>;
export type UpdateCommentDto = z.output<typeof updateCommentSchema>;
export type MarkAnswerDto = z.output<typeof markAnswerSchema>;
export type CommentDto = z.output<typeof commentSchema>;
export type QuestionDto = z.output<typeof questionSchema>;
export type ConversationDto = z.output<typeof conversationSchema>;
export type UnreadCountsDto = z.output<typeof unreadCountsSchema>;
export type UnreadCommentsDto = z.output<typeof unreadCommentsSchema>;

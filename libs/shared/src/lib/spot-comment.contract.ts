import { z } from 'zod';

/**
 * Questions and replies on a spot, defined once for both sides of the wire.
 *
 * A question is a comment with no parent; a reply names the question it
 * answers. Replies go one level deep — a conversation about a place reads as
 * Q&A, not as a tree.
 */

export const MAX_COMMENT_LENGTH = 2000;

const commentBody = z
  .string()
  .trim()
  .min(1, 'Write something first')
  .max(MAX_COMMENT_LENGTH, `Keep it under ${String(MAX_COMMENT_LENGTH)} characters`);

/** A question, or — with `parentId` — a reply to one. */
export const createSpotCommentSchema = z.object({
  body: commentBody,
  parentId: z.uuid().nullable().default(null),
});

/** Only the words change; a comment never moves to another question or spot. */
export const updateSpotCommentSchema = z.object({
  body: commentBody,
});

/** The spot's owner marks one reply as its question's answer, or takes the mark back. */
export const markAnswerSchema = z.object({
  isAnswer: z.boolean(),
});

export const spotCommentSchema = z.object({
  id: z.uuid(),
  body: z.string(),
  /** The author's display name, or null when they never set one. Never an email. */
  authorName: z.string().nullable(),
  /** Written by the spot's owner — shown as such, since theirs is the answer people want. */
  byOwner: z.boolean(),
  /** Written by the person asking. Only they can edit it. */
  byViewer: z.boolean(),
  /** The person asking may delete it: their own comment, or anything on their own spot. */
  canDelete: z.boolean(),
  /** A reply the spot's owner marked as its question's answer. Always false on a question. */
  isAnswer: z.boolean(),
  createdAt: z.string(),
  editedAt: z.string().nullable(),
});

export const spotQuestionSchema = spotCommentSchema.extend({
  /** Oldest first, the order the conversation happened in. */
  replies: z.array(spotCommentSchema),
  /** One of its replies is marked as the answer. */
  answered: z.boolean(),
});

/** Everything said on one spot, newest question first. */
export const spotCommentsSchema = z.object({
  questions: z.array(spotQuestionSchema),
  /** The person asking owns the spot, and so may mark answers. */
  viewerOwnsSpot: z.boolean(),
});

/** Comments by other people waiting on the viewer's own spots since they last read them. */
export const unreadSpotCommentsSchema = z.object({
  total: z.number().int(),
  /** Spot id to count; a spot with nothing unread is absent. */
  bySpot: z.record(z.string(), z.number().int()),
});

export type CreateSpotCommentDto = z.output<typeof createSpotCommentSchema>;
export type UpdateSpotCommentDto = z.output<typeof updateSpotCommentSchema>;
export type MarkAnswerDto = z.output<typeof markAnswerSchema>;
export type SpotCommentDto = z.output<typeof spotCommentSchema>;
export type SpotQuestionDto = z.output<typeof spotQuestionSchema>;
export type SpotCommentsDto = z.output<typeof spotCommentsSchema>;
export type UnreadSpotCommentsDto = z.output<typeof unreadSpotCommentsSchema>;

import type { CommentDto, ConversationDto } from '@spothub/shared';

import type { CommentEntity } from './comment.entity';

/** Who is looking, and whose spot or build it is — what every permission flag is worked out from. */
export interface CommentViewContext {
  readonly viewerId: string;
  readonly ownerId: string;
}

/**
 * The single place comments become a wire object, grouped into questions and
 * their replies. The flags say what the viewer may do, so the client never
 * re-derives a permission the server would refuse anyway — they mirror the
 * repository's scoped writes exactly.
 */
export function toConversationDto(
  comments: readonly CommentEntity[],
  context: CommentViewContext,
): ConversationDto {
  const askerOf = new Map<string, string>();

  for (const comment of comments) {
    if (comment.parentId === null) {
      askerOf.set(comment.id, comment.authorId);
    }
  }

  const repliesByQuestion = new Map<string, CommentDto[]>();

  for (const comment of comments) {
    if (comment.parentId !== null) {
      const replies = repliesByQuestion.get(comment.parentId) ?? [];
      replies.push(toCommentDto(comment, context, askerOf.get(comment.parentId) ?? null));
      repliesByQuestion.set(comment.parentId, replies);
    }
  }

  const questions = comments
    .filter((comment) => comment.parentId === null)
    .map((question) => {
      const replies = repliesByQuestion.get(question.id) ?? [];

      return {
        ...toCommentDto(question, context, null),
        replies,
        answered: replies.some((reply) => reply.isAnswer),
      };
    })
    // Comments arrive oldest first: newest question first, replies left in order.
    .reverse();

  return { questions, viewerOwnsSubject: context.viewerId === context.ownerId };
}

/** `askerId` is the author of the question a reply answers; null for a question itself. */
function toCommentDto(
  comment: CommentEntity,
  context: CommentViewContext,
  askerId: string | null,
): CommentDto {
  const byViewer = comment.authorId === context.viewerId;
  const viewerOwnsSubject = context.viewerId === context.ownerId;

  return {
    id: comment.id,
    body: comment.body,
    authorName: comment.authorName,
    byOwner: comment.authorId === context.ownerId,
    byViewer,
    canDelete: byViewer || viewerOwnsSubject,
    isAnswer: comment.isAnswer,
    canMarkAnswer:
      askerId !== null &&
      comment.authorId !== askerId &&
      (viewerOwnsSubject || context.viewerId === askerId),
    createdAt: comment.createdAt.toISOString(),
    editedAt: comment.editedAt?.toISOString() ?? null,
  };
}

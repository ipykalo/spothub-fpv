import type { SpotCommentDto, SpotCommentsDto } from '@spothub/shared';

import type { SpotCommentEntity } from './spot-comment.entity';

/** Who is looking, and whose spot it is — what every permission flag is worked out from. */
export interface CommentViewContext {
  readonly viewerId: string;
  readonly ownerId: string;
}

/**
 * The single place comments become a wire object, grouped into questions and
 * their replies. The flags say what the viewer may do, so the client never
 * re-derives a permission the server would refuse anyway.
 */
export function toSpotCommentsDto(
  comments: readonly SpotCommentEntity[],
  context: CommentViewContext,
): SpotCommentsDto {
  const repliesByQuestion = new Map<string, SpotCommentDto[]>();

  for (const comment of comments) {
    if (comment.parentId !== null) {
      const replies = repliesByQuestion.get(comment.parentId) ?? [];
      replies.push(toCommentDto(comment, context));
      repliesByQuestion.set(comment.parentId, replies);
    }
  }

  const questions = comments
    .filter((comment) => comment.parentId === null)
    .map((question) => {
      const replies = repliesByQuestion.get(question.id) ?? [];

      return {
        ...toCommentDto(question, context),
        replies,
        answered: replies.some((reply) => reply.isAnswer),
      };
    })
    // Comments arrive oldest first: newest question first, replies left in order.
    .reverse();

  return { questions, viewerOwnsSpot: context.viewerId === context.ownerId };
}

function toCommentDto(comment: SpotCommentEntity, context: CommentViewContext): SpotCommentDto {
  const byViewer = comment.authorId === context.viewerId;

  return {
    id: comment.id,
    body: comment.body,
    authorName: comment.authorName,
    byOwner: comment.authorId === context.ownerId,
    byViewer,
    canDelete: byViewer || context.viewerId === context.ownerId,
    isAnswer: comment.isAnswer,
    createdAt: comment.createdAt.toISOString(),
    editedAt: comment.editedAt?.toISOString() ?? null,
  };
}

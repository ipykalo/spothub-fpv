import type { CommentDto, ConversationDto, HiddenCommentDto } from '@spothub/shared';

import type { CommentEntity, HiddenCommentEntity } from './comment.entity';

/** How much of a hidden comment the Admin page shows. */
const EXCERPT_LENGTH = 280;

/**
 * Who is looking, and whose spot or build it is — what every permission flag
 * is worked out from. A null viewer is a signed-out visitor: every flag is false.
 */
export interface CommentViewContext {
  readonly viewerId: string | null;
  readonly ownerId: string;
  /** Whether a reply can be marked as the answer — on spots and builds, not on a post's discussion. */
  readonly answers: boolean;
}

/**
 * The single place comments become a wire object, grouped into questions and
 * their replies. The flags say what the viewer may do, so the client never
 * re-derives a permission the server would refuse anyway — they mirror the
 * repository's scoped writes exactly.
 */
export function toConversationDto(
  all: readonly CommentEntity[],
  context: CommentViewContext,
): ConversationDto {
  const comments = withoutHidden(all);
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

/**
 * What an admin hid is left out: a hidden reply, and a hidden question nobody
 * replied to. A hidden question with replies stays as a placeholder, so the
 * replies keep their context — as does what is left of a deleted question,
 * which goes too once nothing visible is under it.
 */
function withoutHidden(comments: readonly CommentEntity[]): CommentEntity[] {
  const shownReplies = comments.filter(
    (comment) => comment.parentId !== null && comment.hiddenAt === null,
  );
  const answered = new Set(shownReplies.map((reply) => reply.parentId));

  return comments.filter((comment) =>
    comment.parentId === null
      ? (comment.hiddenAt === null && comment.deletedAt === null) ||
        answered.has(comment.id)
      : comment.hiddenAt === null,
  );
}

/** `askerId` is the author of the question a reply answers; null for a question itself. */
function toCommentDto(
  comment: CommentEntity,
  context: CommentViewContext,
  askerId: string | null,
): CommentDto {
  const viewerOwnsSubject = context.viewerId === context.ownerId;
  const deleted = comment.deletedAt !== null;
  const hidden = comment.hiddenAt !== null;
  // A deleted or hidden question no longer says who asked it, not even to the asker.
  const gone = deleted || hidden;
  const byViewer = !gone && comment.authorId === context.viewerId;

  return {
    id: comment.id,
    body: gone ? '' : comment.body,
    authorName: gone ? null : comment.authorName,
    byOwner: !gone && comment.authorId === context.ownerId,
    byViewer,
    // What is left of a deleted or hidden question is the owner's to clear.
    canDelete: byViewer || viewerOwnsSubject,
    deleted,
    hidden,
    isAnswer: comment.isAnswer,
    canMarkAnswer:
      context.answers &&
      askerId !== null &&
      comment.authorId !== askerId &&
      (viewerOwnsSubject || context.viewerId === askerId),
    createdAt: comment.createdAt.toISOString(),
    editedAt: gone ? null : (comment.editedAt?.toISOString() ?? null),
  };
}

/** A hidden comment, as the Admin page lists it. */
export function toHiddenCommentDto(comment: HiddenCommentEntity): HiddenCommentDto {
  return {
    id: comment.id,
    excerpt: comment.body.slice(0, EXCERPT_LENGTH),
    authorName: comment.authorName,
    place: comment.place,
    hiddenAt: comment.hiddenAt.toISOString(),
  };
}

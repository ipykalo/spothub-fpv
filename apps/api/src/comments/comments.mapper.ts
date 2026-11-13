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
  /** Pilots the viewer blocked: their words are left out of what the viewer sees. */
  readonly blocked: ReadonlySet<string>;
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
  const comments = withoutUnseen(all, context.blocked);
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
 * What an admin hid, and what a pilot the viewer blocked wrote, is left out: a
 * reply, and a question nobody replied to. Such a question with replies stays
 * as a placeholder, so the replies keep their context — as does what is left
 * of a deleted question, which goes too once nothing visible is under it.
 */
function withoutUnseen(
  comments: readonly CommentEntity[],
  blocked: ReadonlySet<string>,
): CommentEntity[] {
  const seen = (comment: CommentEntity): boolean =>
    comment.hiddenAt === null && !blocked.has(comment.authorId);
  const shownReplies = comments.filter(
    (comment) => comment.parentId !== null && seen(comment),
  );
  const answered = new Set(shownReplies.map((reply) => reply.parentId));

  return comments.filter((comment) =>
    comment.parentId === null
      ? (seen(comment) && comment.deletedAt === null) || answered.has(comment.id)
      : seen(comment),
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
  const blocked = !deleted && !hidden && context.blocked.has(comment.authorId);
  // A deleted, hidden or blocked question no longer says who asked it, not even to the asker.
  const gone = deleted || hidden || blocked;
  const byViewer = !gone && comment.authorId === context.viewerId;

  return {
    id: comment.id,
    body: gone ? '' : comment.body,
    authorName: gone ? null : comment.authorName,
    // A signed-out visitor can block nobody, so is told nobody's id.
    authorId: gone || context.viewerId === null ? null : comment.authorId,
    byOwner: !gone && comment.authorId === context.ownerId,
    byViewer,
    // What is left of a deleted or hidden question is the owner's to clear.
    canDelete: byViewer || viewerOwnsSubject,
    deleted,
    hidden,
    blocked,
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

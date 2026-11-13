import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  CommentSubject,
  pilotPhotoUrl,
  publicName,
  ReportPlaceKind,
} from '@spothub/shared';

import { PrismaService } from '../prisma';
import { CommentsRepository } from './abstract/comments.repository';
import type {
  CommentEntity,
  CommentPlacement,
  CreateCommentData,
  HiddenCommentEntity,
  SubjectRef,
  UnreadBySubject,
} from './comment.entity';

/** Only the author's display name rides along — never the rest of their user row. */
const WITH_AUTHOR_NAME = {
  author: { select: { displayName: true, pilotName: true, photoAssetId: true } },
} satisfies Prisma.CommentInclude;

type CommentRow = Prisma.CommentGetPayload<{ include: typeof WITH_AUTHOR_NAME }>;

/**
 * The only place in the comments feature that knows Prisma exists. Joining
 * `spots` or `builds` to learn who owns the subject is SQL inside this
 * repository, not a call across modules — it is what keeps "or the owner"
 * inside the same `deleteMany` as the id it deletes.
 */
@Injectable()
export class PrismaCommentsRepository extends CommentsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findManyOn(ref: SubjectRef): Promise<CommentEntity[]> {
    const rows = await this.prisma.comment.findMany({
      where: onSubject(ref),
      include: WITH_AUTHOR_NAME,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return rows.map(toEntity);
  }

  async findOneOn(ref: SubjectRef, commentId: string): Promise<CommentEntity | null> {
    const row = await this.prisma.comment.findFirst({
      where: { id: commentId, ...onSubject(ref) },
      include: WITH_AUTHOR_NAME,
    });

    return row ? toEntity(row) : null;
  }

  async findPlacement(commentId: string): Promise<CommentPlacement | null> {
    const row = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: {
        spotId: true,
        buildId: true,
        postId: true,
        authorId: true,
        deletedAt: true,
        hiddenAt: true,
      },
    });

    if (!row) {
      return null;
    }

    const ref: SubjectRef | null = row.spotId
      ? { subject: CommentSubject.Spot, subjectId: row.spotId }
      : row.buildId
        ? { subject: CommentSubject.Build, subjectId: row.buildId }
        : row.postId
          ? { subject: CommentSubject.Post, subjectId: row.postId }
          : null;

    return ref
      ? {
          ref,
          authorId: row.authorId,
          deleted: row.deletedAt !== null,
          hidden: row.hiddenAt !== null,
        }
      : null;
  }

  async create(ref: SubjectRef, data: CreateCommentData): Promise<CommentEntity> {
    const row = await this.prisma.comment.create({
      data: { ...data, ...onSubject(ref) },
      include: WITH_AUTHOR_NAME,
    });

    return toEntity(row);
  }

  async updateBodyForAuthor(
    authorId: string,
    ref: SubjectRef,
    commentId: string,
    body: string,
  ): Promise<boolean> {
    const { count } = await this.prisma.comment.updateMany({
      // A deleted question has no words left to reword, and a hidden one stays as an admin left it.
      where: {
        id: commentId,
        authorId,
        deletedAt: null,
        hiddenAt: null,
        ...onSubject(ref),
      },
      data: { body, editedAt: new Date() },
    });

    return count > 0;
  }

  deleteForViewer(
    viewerId: string,
    ref: SubjectRef,
    commentId: string,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // A comment on this subject that the viewer wrote, or on a subject the viewer owns.
      const comment = await tx.comment.findFirst({
        where: {
          id: commentId,
          ...onSubject(ref),
          OR: [{ authorId: viewerId }, subjectOwnedBy(ref, viewerId)],
        },
        select: {
          authorId: true,
          parentId: true,
          deletedAt: true,
          spot: { select: { ownerId: true } },
          build: { select: { ownerId: true } },
          post: { select: { authorId: true } },
          _count: { select: { replies: true } },
        },
      });

      if (!comment) {
        return false;
      }

      const ownsSubject =
        (comment.spot?.ownerId ?? comment.build?.ownerId ?? comment.post?.authorId) ===
        viewerId;

      // Already deleted by its asker: only the owner can remove what is left.
      if (comment.deletedAt !== null && !ownsSubject) {
        return false;
      }

      // An asker taking back a question others replied to: the words go, the replies stay.
      if (
        comment.parentId === null &&
        comment.authorId === viewerId &&
        comment.deletedAt === null &&
        comment._count.replies > 0
      ) {
        await tx.comment.updateMany({
          where: { id: commentId, authorId: viewerId },
          data: { body: '', deletedAt: new Date() },
        });

        return true;
      }

      // Replies go through the foreign key's ON DELETE CASCADE.
      await tx.comment.deleteMany({ where: { id: commentId, ...onSubject(ref) } });

      // A deleted question has nothing left to show once its last reply is gone.
      if (comment.parentId !== null) {
        await tx.comment.deleteMany({
          where: {
            id: comment.parentId,
            deletedAt: { not: null },
            replies: { none: {} },
          },
        });
      }

      return true;
    });
  }

  setAnswerForAskerOrOwner(
    viewerId: string,
    ref: SubjectRef,
    replyId: string,
    isAnswer: boolean,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // A reply on this subject, to a question the viewer asked or on a subject the viewer owns.
      const reply = await tx.comment.findFirst({
        where: {
          id: replyId,
          ...onSubject(ref),
          parentId: { not: null },
          OR: [subjectOwnedBy(ref, viewerId), { parent: { authorId: viewerId } }],
        },
        select: {
          parentId: true,
          authorId: true,
          parent: { select: { authorId: true } },
        },
      });

      if (!reply?.parentId) {
        return false;
      }

      // The asker's own follow-up or thank-you never answers the question it follows.
      // Two columns compared, so it is checked here rather than in the `where`.
      if (reply.authorId === reply.parent?.authorId) {
        return false;
      }

      // One answer per question: marking this one clears any other.
      if (isAnswer) {
        await tx.comment.updateMany({
          where: { parentId: reply.parentId, isAnswer: true, id: { not: replyId } },
          data: { isAnswer: false },
        });
      }

      await tx.comment.update({ where: { id: replyId }, data: { isAnswer } });

      return true;
    });
  }

  async markReadForUser(userId: string, ref: SubjectRef): Promise<void> {
    const readAt = new Date();

    switch (ref.subject) {
      case CommentSubject.Spot:
        await this.prisma.commentRead.upsert({
          where: { spotId_userId: { spotId: ref.subjectId, userId } },
          create: { spotId: ref.subjectId, userId },
          update: { readAt },
        });
        break;
      case CommentSubject.Build:
        await this.prisma.commentRead.upsert({
          where: { buildId_userId: { buildId: ref.subjectId, userId } },
          create: { buildId: ref.subjectId, userId },
          update: { readAt },
        });
        break;
      case CommentSubject.Post:
        await this.prisma.commentRead.upsert({
          where: { postId_userId: { postId: ref.subjectId, userId } },
          create: { postId: ref.subjectId, userId },
          update: { readAt },
        });
        break;
    }
  }

  async countUnreadForOwner(ownerId: string): Promise<UnreadBySubject> {
    // One query for every spot, build and post the owner has, rather than one per card.
    // A pilot the owner blocked is not counted: their comments are not shown to them.
    const rows = await this.prisma.$queryRaw<
      { subject: CommentSubject; subject_id: string; unread: number }[]
    >`
      SELECT 'SPOT' AS subject, c.spot_id AS subject_id, COUNT(*)::int AS unread
      FROM comments c
      JOIN spots s ON s.id = c.spot_id
      LEFT JOIN comment_reads r ON r.spot_id = c.spot_id AND r.user_id = s.owner_id
      WHERE s.owner_id = ${ownerId}::uuid
        AND c.author_id <> s.owner_id
        AND c.deleted_at IS NULL
        AND c.hidden_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM pilot_blocks pb
          WHERE pb.blocker_id = ${ownerId}::uuid AND pb.blocked_id = c.author_id
        )
        AND (r.read_at IS NULL OR c.created_at > r.read_at)
      GROUP BY c.spot_id
      UNION ALL
      SELECT 'BUILD' AS subject, c.build_id AS subject_id, COUNT(*)::int AS unread
      FROM comments c
      JOIN builds b ON b.id = c.build_id
      LEFT JOIN comment_reads r ON r.build_id = c.build_id AND r.user_id = b.owner_id
      WHERE b.owner_id = ${ownerId}::uuid
        AND c.author_id <> b.owner_id
        AND c.deleted_at IS NULL
        AND c.hidden_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM pilot_blocks pb
          WHERE pb.blocker_id = ${ownerId}::uuid AND pb.blocked_id = c.author_id
        )
        AND (r.read_at IS NULL OR c.created_at > r.read_at)
      GROUP BY c.build_id
      UNION ALL
      SELECT 'POST' AS subject, c.post_id AS subject_id, COUNT(*)::int AS unread
      FROM comments c
      JOIN posts p ON p.id = c.post_id
      LEFT JOIN comment_reads r ON r.post_id = c.post_id AND r.user_id = p.author_id
      WHERE p.author_id = ${ownerId}::uuid
        AND c.author_id <> p.author_id
        AND c.deleted_at IS NULL
        AND c.hidden_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM pilot_blocks pb
          WHERE pb.blocker_id = ${ownerId}::uuid AND pb.blocked_id = c.author_id
        )
        AND (r.read_at IS NULL OR c.created_at > r.read_at)
      GROUP BY c.post_id
    `;

    const counts = {
      [CommentSubject.Spot]: new Map<string, number>(),
      [CommentSubject.Build]: new Map<string, number>(),
      [CommentSubject.Post]: new Map<string, number>(),
    };

    for (const row of rows) {
      counts[row.subject].set(row.subject_id, row.unread);
    }

    return counts;
  }

  async findHidden(): Promise<HiddenCommentEntity[]> {
    const rows = await this.prisma.comment.findMany({
      where: { hiddenAt: { not: null } },
      select: {
        id: true,
        body: true,
        spotId: true,
        buildId: true,
        hiddenAt: true,
        author: { select: { displayName: true, pilotName: true } },
        post: { select: { id: true, slug: true } },
      },
      orderBy: [{ hiddenAt: 'desc' }, { id: 'asc' }],
    });

    return rows.flatMap((row) => {
      const place = row.post
        ? { kind: ReportPlaceKind.Post, id: row.post.id, slug: row.post.slug }
        : row.spotId
          ? { kind: ReportPlaceKind.Spot, id: row.spotId, slug: null }
          : row.buildId
            ? { kind: ReportPlaceKind.Build, id: row.buildId, slug: null }
            : null;

      return place && row.hiddenAt
        ? [
            {
              id: row.id,
              body: row.body,
              authorName:
                publicName(row.author.pilotName, row.author.displayName) ?? 'A pilot',
              place,
              hiddenAt: row.hiddenAt,
            },
          ]
        : [];
    });
  }

  async setHidden(commentId: string, hidden: boolean): Promise<boolean> {
    // What is left of a deleted question has no words to hide.
    const { count } = await this.prisma.comment.updateMany({
      where: { id: commentId, deletedAt: null },
      data: { hiddenAt: hidden ? new Date() : null },
    });

    return count > 0;
  }

  deleteAny(commentId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.comment.findUnique({
        where: { id: commentId },
        select: { parentId: true },
      });

      if (!comment) {
        return false;
      }

      // Replies go through the foreign key's ON DELETE CASCADE.
      await tx.comment.deleteMany({ where: { id: commentId } });

      if (comment.parentId !== null) {
        await tx.comment.deleteMany({
          where: {
            id: comment.parentId,
            deletedAt: { not: null },
            replies: { none: {} },
          },
        });
      }

      return true;
    });
  }
}

/** The column a subject's comments hang off — a filter on reads, the value on create. */
function onSubject(
  ref: SubjectRef,
): { spotId: string } | { buildId: string } | { postId: string } {
  switch (ref.subject) {
    case CommentSubject.Spot:
      return { spotId: ref.subjectId };
    case CommentSubject.Build:
      return { buildId: ref.subjectId };
    case CommentSubject.Post:
      return { postId: ref.subjectId };
  }
}

/** The subject is the viewer's own — a post is its author's — as a join to its table. */
function subjectOwnedBy(ref: SubjectRef, ownerId: string): Prisma.CommentWhereInput {
  switch (ref.subject) {
    case CommentSubject.Spot:
      return { spot: { ownerId } };
    case CommentSubject.Build:
      return { build: { ownerId } };
    case CommentSubject.Post:
      return { post: { authorId: ownerId } };
  }
}

function toEntity(row: CommentRow): CommentEntity {
  return {
    id: row.id,
    authorId: row.authorId,
    authorName: publicName(row.author.pilotName, row.author.displayName),
    authorPhotoUrl: pilotPhotoUrl(row.authorId, row.author.photoAssetId),
    parentId: row.parentId,
    body: row.body,
    isAnswer: row.isAnswer,
    editedAt: row.editedAt,
    deletedAt: row.deletedAt,
    hiddenAt: row.hiddenAt,
    createdAt: row.createdAt,
  };
}

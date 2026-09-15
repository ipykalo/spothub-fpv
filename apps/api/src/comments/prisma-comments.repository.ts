import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { CommentSubject } from '@spothub/shared';

import { PrismaService } from '../prisma';
import { CommentsRepository } from './abstract/comments.repository';
import type {
  CommentEntity,
  CreateCommentData,
  SubjectRef,
  UnreadBySubject,
} from './comment.entity';

/** Only the author's display name rides along — never the rest of their user row. */
const WITH_AUTHOR_NAME = {
  author: { select: { displayName: true } },
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
      where: { id: commentId, authorId, ...onSubject(ref) },
      data: { body, editedAt: new Date() },
    });

    return count > 0;
  }

  async deleteForViewer(viewerId: string, ref: SubjectRef, commentId: string): Promise<boolean> {
    // Replies go through the foreign key's ON DELETE CASCADE.
    const { count } = await this.prisma.comment.deleteMany({
      where: {
        id: commentId,
        ...onSubject(ref),
        OR: [{ authorId: viewerId }, subjectOwnedBy(ref, viewerId)],
      },
    });

    return count > 0;
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
        select: { parentId: true, authorId: true, parent: { select: { authorId: true } } },
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

    if (ref.subject === CommentSubject.Spot) {
      await this.prisma.commentRead.upsert({
        where: { spotId_userId: { spotId: ref.subjectId, userId } },
        create: { spotId: ref.subjectId, userId },
        update: { readAt },
      });
    } else {
      await this.prisma.commentRead.upsert({
        where: { buildId_userId: { buildId: ref.subjectId, userId } },
        create: { buildId: ref.subjectId, userId },
        update: { readAt },
      });
    }
  }

  async countUnreadForOwner(ownerId: string): Promise<UnreadBySubject> {
    // One query for every spot and build the owner has, rather than one per card.
    const rows = await this.prisma.$queryRaw<
      { subject: CommentSubject; subject_id: string; unread: number }[]
    >`
      SELECT 'SPOT' AS subject, c.spot_id AS subject_id, COUNT(*)::int AS unread
      FROM comments c
      JOIN spots s ON s.id = c.spot_id
      LEFT JOIN comment_reads r ON r.spot_id = c.spot_id AND r.user_id = s.owner_id
      WHERE s.owner_id = ${ownerId}::uuid
        AND c.author_id <> s.owner_id
        AND (r.read_at IS NULL OR c.created_at > r.read_at)
      GROUP BY c.spot_id
      UNION ALL
      SELECT 'BUILD' AS subject, c.build_id AS subject_id, COUNT(*)::int AS unread
      FROM comments c
      JOIN builds b ON b.id = c.build_id
      LEFT JOIN comment_reads r ON r.build_id = c.build_id AND r.user_id = b.owner_id
      WHERE b.owner_id = ${ownerId}::uuid
        AND c.author_id <> b.owner_id
        AND (r.read_at IS NULL OR c.created_at > r.read_at)
      GROUP BY c.build_id
    `;

    const spots = new Map<string, number>();
    const builds = new Map<string, number>();

    for (const row of rows) {
      (row.subject === CommentSubject.Spot ? spots : builds).set(row.subject_id, row.unread);
    }

    return { [CommentSubject.Spot]: spots, [CommentSubject.Build]: builds };
  }
}

/** The column a subject's comments hang off — a filter on reads, the value on create. */
function onSubject(ref: SubjectRef): { spotId: string } | { buildId: string } {
  return ref.subject === CommentSubject.Spot
    ? { spotId: ref.subjectId }
    : { buildId: ref.subjectId };
}

/** The subject is the viewer's own, as a join to its table. */
function subjectOwnedBy(ref: SubjectRef, ownerId: string): Prisma.CommentWhereInput {
  return ref.subject === CommentSubject.Spot ? { spot: { ownerId } } : { build: { ownerId } };
}

function toEntity(row: CommentRow): CommentEntity {
  return {
    id: row.id,
    authorId: row.authorId,
    authorName: row.author.displayName,
    parentId: row.parentId,
    body: row.body,
    isAnswer: row.isAnswer,
    editedAt: row.editedAt,
    createdAt: row.createdAt,
  };
}

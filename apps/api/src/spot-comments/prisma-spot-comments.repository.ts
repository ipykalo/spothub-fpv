import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma';
import { SpotCommentsRepository } from './abstract/spot-comments.repository';
import type { CreateSpotCommentData, SpotCommentEntity } from './spot-comment.entity';

/** Only the author's display name rides along — never the rest of their user row. */
const WITH_AUTHOR_NAME = {
  author: { select: { displayName: true } },
} satisfies Prisma.SpotCommentInclude;

type CommentRow = Prisma.SpotCommentGetPayload<{ include: typeof WITH_AUTHOR_NAME }>;

/**
 * The only place in the comments feature that knows Prisma exists. Joining
 * `spots` to learn who owns a spot is SQL inside this repository, not a call
 * across modules — it is what keeps "or the spot's owner" inside the same
 * `deleteMany` as the id it deletes.
 */
@Injectable()
export class PrismaSpotCommentsRepository extends SpotCommentsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findManyForSpot(spotId: string): Promise<SpotCommentEntity[]> {
    const rows = await this.prisma.spotComment.findMany({
      where: { spotId },
      include: WITH_AUTHOR_NAME,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return rows.map(toEntity);
  }

  async findOneForSpot(spotId: string, commentId: string): Promise<SpotCommentEntity | null> {
    const row = await this.prisma.spotComment.findFirst({
      where: { id: commentId, spotId },
      include: WITH_AUTHOR_NAME,
    });

    return row ? toEntity(row) : null;
  }

  async create(data: CreateSpotCommentData): Promise<SpotCommentEntity> {
    const row = await this.prisma.spotComment.create({ data, include: WITH_AUTHOR_NAME });
    return toEntity(row);
  }

  async updateBodyForAuthor(
    authorId: string,
    spotId: string,
    commentId: string,
    body: string,
  ): Promise<boolean> {
    const { count } = await this.prisma.spotComment.updateMany({
      where: { id: commentId, spotId, authorId },
      data: { body, editedAt: new Date() },
    });

    return count > 0;
  }

  async deleteForViewer(viewerId: string, spotId: string, commentId: string): Promise<boolean> {
    // Replies go through the foreign key's ON DELETE CASCADE.
    const { count } = await this.prisma.spotComment.deleteMany({
      where: {
        id: commentId,
        spotId,
        OR: [{ authorId: viewerId }, { spot: { ownerId: viewerId } }],
      },
    });

    return count > 0;
  }

  setAnswerForSpotOwner(
    ownerId: string,
    spotId: string,
    replyId: string,
    isAnswer: boolean,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const reply = await tx.spotComment.findFirst({
        where: { id: replyId, spotId, parentId: { not: null }, spot: { ownerId } },
        select: { parentId: true },
      });

      if (!reply?.parentId) {
        return false;
      }

      // One answer per question: marking this one clears any other.
      if (isAnswer) {
        await tx.spotComment.updateMany({
          where: { parentId: reply.parentId, isAnswer: true, id: { not: replyId } },
          data: { isAnswer: false },
        });
      }

      await tx.spotComment.update({ where: { id: replyId }, data: { isAnswer } });

      return true;
    });
  }

  async markReadForUser(userId: string, spotId: string): Promise<void> {
    await this.prisma.spotCommentRead.upsert({
      where: { spotId_userId: { spotId, userId } },
      create: { spotId, userId },
      update: { readAt: new Date() },
    });
  }

  async countUnreadForOwner(ownerId: string): Promise<ReadonlyMap<string, number>> {
    // One grouped query for every spot the owner has, rather than one per card.
    const rows = await this.prisma.$queryRaw<{ spot_id: string; unread: number }[]>`
      SELECT c.spot_id, COUNT(*)::int AS unread
      FROM spot_comments c
      JOIN spots s ON s.id = c.spot_id
      LEFT JOIN spot_comment_reads r ON r.spot_id = c.spot_id AND r.user_id = s.owner_id
      WHERE s.owner_id = ${ownerId}::uuid
        AND c.author_id <> s.owner_id
        AND (r.read_at IS NULL OR c.created_at > r.read_at)
      GROUP BY c.spot_id
    `;

    return new Map(rows.map((row) => [row.spot_id, row.unread]));
  }
}

function toEntity(row: CommentRow): SpotCommentEntity {
  return {
    id: row.id,
    spotId: row.spotId,
    authorId: row.authorId,
    authorName: row.author.displayName,
    parentId: row.parentId,
    body: row.body,
    isAnswer: row.isAnswer,
    editedAt: row.editedAt,
    createdAt: row.createdAt,
  };
}

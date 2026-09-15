import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma';
import { LikesRepository } from './abstract/likes.repository';
import { type LikeRef, LikeSubject, type LikeTally } from './like.entity';

const SHARED = { visibility: { in: ['PUBLIC' as const, 'UNLISTED' as const] } };

/** The only place in the likes feature that knows Prisma exists. */
@Injectable()
export class PrismaLikesRepository extends LikesRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * One lookup per subject kind, as a table: a subject added to `LikeSubject`
   * without its visibility rule fails to compile.
   */
  private readonly visibility: Record<
    LikeSubject,
    (viewerId: string | null, id: string) => Promise<boolean>
  > = {
    [LikeSubject.Post]: async (viewerId, id) =>
      (await this.prisma.post.count({
        where: {
          id,
          ...(viewerId === null ? SHARED : { OR: [{ authorId: viewerId }, SHARED] }),
        },
      })) > 0,
    [LikeSubject.Build]: async (viewerId, id) =>
      (await this.prisma.build.count({
        where: {
          id,
          ...(viewerId === null ? SHARED : { OR: [{ ownerId: viewerId }, SHARED] }),
        },
      })) > 0,
  };

  subjectVisibleToViewer(viewerId: string | null, ref: LikeRef): Promise<boolean> {
    return this.visibility[ref.subject](viewerId, ref.subjectId);
  }

  async addForUser(userId: string, ref: LikeRef): Promise<void> {
    // ON CONFLICT DO NOTHING against the one-like-per-pilot unique index.
    await this.prisma.like.createMany({
      data: [{ userId, ...column(ref) }],
      skipDuplicates: true,
    });
  }

  async removeForUser(userId: string, ref: LikeRef): Promise<void> {
    await this.prisma.like.deleteMany({ where: { userId, ...column(ref) } });
  }

  async tallies(
    subject: LikeSubject,
    subjectIds: readonly string[],
    viewerId: string | null,
  ): Promise<ReadonlyMap<string, LikeTally>> {
    if (subjectIds.length === 0) {
      return new Map();
    }

    const ids = [...subjectIds];
    const counts = new Map<string, number>();
    const mine = new Set<string>();

    // Two queries for the whole list, whatever its length: the counts grouped
    // by subject, and which of them the viewer is among.
    if (subject === LikeSubject.Post) {
      const grouped = await this.prisma.like.groupBy({
        by: ['postId'],
        where: { postId: { in: ids } },
        _count: { _all: true },
      });
      grouped.forEach((row) => row.postId && counts.set(row.postId, row._count._all));

      if (viewerId !== null) {
        const own = await this.prisma.like.findMany({
          where: { userId: viewerId, postId: { in: ids } },
          select: { postId: true },
        });
        own.forEach((row) => row.postId && mine.add(row.postId));
      }
    } else {
      const grouped = await this.prisma.like.groupBy({
        by: ['buildId'],
        where: { buildId: { in: ids } },
        _count: { _all: true },
      });
      grouped.forEach((row) => row.buildId && counts.set(row.buildId, row._count._all));

      if (viewerId !== null) {
        const own = await this.prisma.like.findMany({
          where: { userId: viewerId, buildId: { in: ids } },
          select: { buildId: true },
        });
        own.forEach((row) => row.buildId && mine.add(row.buildId));
      }
    }

    return new Map(
      [...counts].map(([id, count]) => [id, { count, likedByViewer: mine.has(id) }]),
    );
  }
}

/** The column a subject's likes hang off. */
function column(ref: LikeRef): { postId: string } | { buildId: string } {
  return ref.subject === LikeSubject.Post
    ? { postId: ref.subjectId }
    : { buildId: ref.subjectId };
}

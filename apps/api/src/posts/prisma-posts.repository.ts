import { pilotPhotoUrl, publicName } from '@spothub/shared';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma';
import { PostsRepository } from './abstract/posts.repository';
import type {
  CreatePostData,
  PostEntity,
  PostFilter,
  UpdatePostData,
} from './post.entity';

/**
 * The author's display name and the linked build ids ride along on every read:
 * only the name, never the rest of the user row, and only the ids — whether a
 * viewer may open each build is the builds module's answer to give.
 */
const WITH_AUTHOR_AND_BUILDS = {
  author: { select: { displayName: true, pilotName: true, photoAssetId: true } },
  builds: { select: { buildId: true }, orderBy: { sortOrder: 'asc' } },
  // What is left of a deleted question is not a comment anyone can read, nor is a hidden one.
  _count: { select: { comments: { where: { deletedAt: null, hiddenAt: null } } } },
} satisfies Prisma.PostInclude;

type PostRow = Prisma.PostGetPayload<{ include: typeof WITH_AUTHOR_AND_BUILDS }>;

/**
 * What anyone may open, signed in or not: a post shared as Public or Unlisted
 * that no admin has hidden. Its author reads it either way.
 */
const SHARED: Prisma.PostWhereInput = {
  visibility: { in: ['PUBLIC', 'UNLISTED'] },
  hiddenAt: null,
};

/** The only place in the posts feature that knows Prisma exists. */
@Injectable()
export class PrismaPostsRepository extends PostsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findManyForAuthor(authorId: string): Promise<PostEntity[]> {
    const rows = await this.prisma.post.findMany({
      where: { authorId },
      include: WITH_AUTHOR_AND_BUILDS,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });

    return rows.map(toEntity);
  }

  async findOneForAuthor(authorId: string, id: string): Promise<PostEntity | null> {
    const row = await this.prisma.post.findFirst({
      where: { id, authorId },
      include: WITH_AUTHOR_AND_BUILDS,
    });

    return row ? toEntity(row) : null;
  }

  async findVisibleForViewer(
    viewerId: string | null,
    id: string,
  ): Promise<PostEntity | null> {
    const row = await this.prisma.post.findFirst({
      where: {
        id,
        ...(viewerId === null ? SHARED : { OR: [{ authorId: viewerId }, SHARED] }),
      },
      include: WITH_AUTHOR_AND_BUILDS,
    });

    return row ? toEntity(row) : null;
  }

  async findPublished(filter: PostFilter): Promise<PostEntity[]> {
    const rows = await this.prisma.post.findMany({
      where: {
        visibility: 'PUBLIC',
        hiddenAt: null,
        ...(filter.buildId ? { builds: { some: { buildId: filter.buildId } } } : {}),
      },
      include: WITH_AUTHOR_AND_BUILDS,
      orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
    });

    return rows.map(toEntity);
  }

  async slugExistsForAuthor(authorId: string, slug: string): Promise<boolean> {
    const found = await this.prisma.post.findUnique({
      where: { authorId_slug: { authorId, slug } },
      select: { id: true },
    });

    return found !== null;
  }

  async create(data: CreatePostData): Promise<PostEntity> {
    const { buildIds, ...fields } = data;

    const row = await this.prisma.post.create({
      data: {
        ...fields,
        builds: {
          create: buildIds.map((buildId, sortOrder) => ({ buildId, sortOrder })),
        },
      },
      include: WITH_AUTHOR_AND_BUILDS,
    });

    return toEntity(row);
  }

  /**
   * `updateMany` scoped by author, then — only if that matched — the linked
   * builds replaced in the same transaction, so a post that is not theirs has
   * neither its fields nor its links touched.
   */
  updateForAuthor(
    authorId: string,
    id: string,
    data: UpdatePostData,
  ): Promise<PostEntity | null> {
    const { buildIds, ...fields } = data;

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.post.updateMany({
        where: { id, authorId },
        // `updatedAt` is written explicitly so a patch that only relinks builds still counts as a change.
        data: { ...fields, updatedAt: new Date() },
      });

      if (count === 0) {
        return null;
      }

      if (buildIds !== undefined) {
        await tx.postBuild.deleteMany({ where: { postId: id } });
        await tx.postBuild.createMany({
          data: buildIds.map((buildId, sortOrder) => ({
            postId: id,
            buildId,
            sortOrder,
          })),
        });
      }

      const row = await tx.post.findFirst({
        where: { id, authorId },
        include: WITH_AUTHOR_AND_BUILDS,
      });

      return row ? toEntity(row) : null;
    });
  }

  async deleteForAuthor(authorId: string, id: string): Promise<boolean> {
    // The links go through the foreign key's ON DELETE CASCADE.
    const { count } = await this.prisma.post.deleteMany({ where: { id, authorId } });
    return count > 0;
  }

  async findAnyById(id: string): Promise<PostEntity | null> {
    const row = await this.prisma.post.findUnique({
      where: { id },
      include: WITH_AUTHOR_AND_BUILDS,
    });

    return row ? toEntity(row) : null;
  }

  async findHidden(): Promise<PostEntity[]> {
    const rows = await this.prisma.post.findMany({
      where: { hiddenAt: { not: null } },
      include: WITH_AUTHOR_AND_BUILDS,
      orderBy: [{ hiddenAt: 'desc' }, { id: 'asc' }],
    });

    return rows.map(toEntity);
  }

  async setHidden(id: string, hidden: boolean): Promise<boolean> {
    const { count } = await this.prisma.post.updateMany({
      where: { id },
      data: { hiddenAt: hidden ? new Date() : null },
    });

    return count > 0;
  }

  async setHiddenForAllBy(authorId: string, hidden: boolean): Promise<number> {
    // Only the ones that change, so the count says what this did and a post
    // hidden earlier keeps the day it was hidden.
    const { count } = await this.prisma.post.updateMany({
      where: { authorId, hiddenAt: hidden ? null : { not: null } },
      data: { hiddenAt: hidden ? new Date() : null },
    });

    return count;
  }

  async deleteAny(id: string): Promise<boolean> {
    const { count } = await this.prisma.post.deleteMany({ where: { id } });
    return count > 0;
  }
}

function toEntity(row: PostRow): PostEntity {
  return {
    id: row.id,
    authorId: row.authorId,
    authorName: publicName(row.author.pilotName, row.author.displayName),
    authorPhotoUrl: pilotPhotoUrl(row.authorId, row.author.photoAssetId),
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    bodyMd: row.bodyMd,
    visibility: row.visibility,
    publishedAt: row.publishedAt,
    coverAssetId: row.coverAssetId,
    hiddenAt: row.hiddenAt,
    buildIds: row.builds.map((link) => link.buildId),
    commentCount: row._count.comments,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type CreatePostDto,
  type ListPublishedPostsQuery,
  type PostDto,
  type PostSummaryDto,
  type UpdatePostDto,
  Visibility,
} from '@spothub/shared';

import { BuildsFacade } from '../builds';
import { uniqueSlug } from '../common';
import { PostsRepository } from './abstract/posts.repository';
import type { UpdatePostData } from './post.entity';
import { toPostDto, toPostSummaryDto } from './posts.mapper';

/**
 * Business rules for blog posts. Knows nothing about HTTP or Prisma.
 *
 * A post links to builds it is about, but it never decides who may see one:
 * linking asks `BuildsFacade` whether each build is the author's own, and
 * reading asks which linked builds this viewer may open — so a build made
 * private after it was written about drops out of the post for everyone else.
 */
@Injectable()
export class PostsService {
  constructor(
    private readonly posts: PostsRepository,
    private readonly builds: BuildsFacade,
  ) {}

  /** The author's own posts, drafts included. */
  async listMine(authorId: string): Promise<PostSummaryDto[]> {
    const posts = await this.posts.findManyForAuthor(authorId);
    return posts.map((post) => toPostSummaryDto(post, authorId));
  }

  /** The blog: Public posts, newest first. `viewerId` is null for a signed-out visitor. */
  async listPublished(
    viewerId: string | null,
    query: ListPublishedPostsQuery,
  ): Promise<PostSummaryDto[]> {
    const posts = await this.posts.findPublished(query);
    return posts.map((post) => toPostSummaryDto(post, viewerId));
  }

  /** The author's own post, or one shared as Public or Unlisted. Anything else is not found. */
  async getOne(viewerId: string | null, id: string): Promise<PostDto> {
    const post = await this.posts.findVisibleForViewer(viewerId, id);

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const builds = await this.builds.visibleToViewer(viewerId, post.buildIds);
    return toPostDto(post, builds, viewerId);
  }

  async create(authorId: string, input: CreatePostDto): Promise<PostDto> {
    await this.assertOwnBuilds(authorId, input.buildIds);

    const slug = await uniqueSlug(input.title, (candidate) =>
      this.posts.slugExistsForAuthor(authorId, candidate),
    );

    const post = await this.posts.create({
      authorId,
      slug,
      title: input.title,
      summary: input.summary,
      bodyMd: input.bodyMd,
      visibility: input.visibility,
      publishedAt: input.visibility === Visibility.Private ? null : new Date(),
      buildIds: input.buildIds,
    });

    return this.getOne(authorId, post.id);
  }

  async update(authorId: string, id: string, input: UpdatePostDto): Promise<PostDto> {
    const current = await this.posts.findOneForAuthor(authorId, id);

    if (!current) {
      throw new NotFoundException('Post not found');
    }

    if (input.buildIds !== undefined) {
      await this.assertOwnBuilds(authorId, input.buildIds);
    }

    const data = toUpdateData(input);

    // Published the first time it leaves Private. Going back to Private and
    // out again keeps the original date.
    if (
      input.visibility !== undefined &&
      input.visibility !== Visibility.Private &&
      current.publishedAt === null
    ) {
      (data as Record<string, unknown>)['publishedAt'] = new Date();
    }

    const updated = await this.posts.updateForAuthor(authorId, id, data);

    if (!updated) {
      throw new NotFoundException('Post not found');
    }

    return this.getOne(authorId, id);
  }

  async remove(authorId: string, id: string): Promise<void> {
    if (!(await this.posts.deleteForAuthor(authorId, id))) {
      throw new NotFoundException('Post not found');
    }
  }

  /** A post may only point at its author's own builds — never at someone else's, shared or not. */
  private async assertOwnBuilds(
    authorId: string,
    buildIds: readonly string[],
  ): Promise<void> {
    if (buildIds.length === 0) {
      return;
    }

    const owned = await this.builds.idsOwnedBy(authorId, buildIds);

    if (buildIds.some((buildId) => !owned.has(buildId))) {
      throw new BadRequestException('A post can link only your own builds');
    }
  }
}

/**
 * Copies only the keys actually present on the patch, so an absent field is
 * left alone rather than being written as null.
 */
function toUpdateData(input: UpdatePostDto): UpdatePostData {
  const data: UpdatePostData = {};
  const patch = data as Record<string, unknown>;

  if (input.title !== undefined) patch['title'] = input.title;
  if (input.summary !== undefined) patch['summary'] = input.summary;
  if (input.bodyMd !== undefined) patch['bodyMd'] = input.bodyMd;
  if (input.visibility !== undefined) patch['visibility'] = input.visibility;
  if (input.buildIds !== undefined) patch['buildIds'] = input.buildIds;

  return data;
}

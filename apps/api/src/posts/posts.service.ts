import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type CreatePostDto,
  type ListPublishedPostsQuery,
  type PostDto,
  type PostSummaryDto,
  type UpdatePostDto,
  Visibility,
  referencedImageIds,
} from '@spothub/shared';

import { BuildsFacade } from '../builds';
import { uniqueSlug } from '../common';
import { MediaFacade } from '../media';
import { PostsRepository } from './abstract/posts.repository';
import type { PostEntity, UpdatePostData } from './post.entity';
import { toPostDto, toPostSummaryDto } from './posts.mapper';

/**
 * Business rules for blog posts. Knows nothing about HTTP or Prisma.
 *
 * A post links to builds it is about, but it never decides who may see one:
 * linking asks `BuildsFacade` whether each build is the author's own, and
 * reading asks which linked builds this viewer may open — so a build made
 * private after it was written about drops out of the post for everyone else.
 *
 * Its images belong to the media module. Reading asks `MediaFacade` for them;
 * saving a body drops the images it no longer shows, and deleting the post
 * deletes them all, so storage never keeps pictures nobody can reach.
 */
@Injectable()
export class PostsService {
  constructor(
    private readonly posts: PostsRepository,
    private readonly builds: BuildsFacade,
    private readonly media: MediaFacade,
  ) {}

  /** The author's own posts, drafts included. */
  async listMine(authorId: string): Promise<PostSummaryDto[]> {
    return this.summaries(await this.posts.findManyForAuthor(authorId), authorId);
  }

  /** The blog: Public posts, newest first. `viewerId` is null for a signed-out visitor. */
  async listPublished(
    viewerId: string | null,
    query: ListPublishedPostsQuery,
  ): Promise<PostSummaryDto[]> {
    return this.summaries(await this.posts.findPublished(query), viewerId);
  }

  /** The author's own post, or one shared as Public or Unlisted. Anything else is not found. */
  async getOne(viewerId: string | null, id: string): Promise<PostDto> {
    const post = await this.posts.findVisibleForViewer(viewerId, id);

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const [builds, images] = await Promise.all([
      this.builds.visibleToViewer(viewerId, post.buildIds),
      this.media.postImages(post.authorId, post.id),
    ]);

    return toPostDto(post, builds, images, viewerId);
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

    // Images the new body no longer shows go, unless one is the cover.
    if (input.bodyMd !== undefined) {
      const keep = referencedImageIds(updated.bodyMd);

      if (updated.coverAssetId !== null) {
        keep.push(updated.coverAssetId);
      }

      await this.media.deletePostImages(authorId, id, keep);
    }

    return this.getOne(authorId, id);
  }

  async remove(authorId: string, id: string): Promise<void> {
    if (!(await this.posts.findOneForAuthor(authorId, id))) {
      throw new NotFoundException('Post not found');
    }

    // Images first: once the post is gone nothing would be left to find them by.
    await this.media.deletePostImages(authorId, id, []);

    if (!(await this.posts.deleteForAuthor(authorId, id))) {
      throw new NotFoundException('Post not found');
    }
  }

  /** Summaries with their cover thumbnails, signed in one batch per author. */
  private async summaries(
    posts: readonly PostEntity[],
    viewerId: string | null,
  ): Promise<PostSummaryDto[]> {
    const coversByAuthor = new Map<string, string[]>();

    for (const post of posts) {
      if (post.coverAssetId !== null) {
        const ids = coversByAuthor.get(post.authorId) ?? [];
        ids.push(post.coverAssetId);
        coversByAuthor.set(post.authorId, ids);
      }
    }

    const urls = new Map<string, string>();

    for (const [authorId, ids] of coversByAuthor) {
      for (const [assetId, url] of await this.media.thumbUrlsFor(authorId, ids)) {
        urls.set(assetId, url);
      }
    }

    return posts.map((post) =>
      toPostSummaryDto(
        post,
        viewerId,
        post.coverAssetId === null ? null : (urls.get(post.coverAssetId) ?? null),
      ),
    );
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

import type { BuildDto, PostDto, PostSummaryDto } from '@spothub/shared';

import type { PostEntity } from './post.entity';

/**
 * The single place a post becomes a wire object. Explicit rather than a
 * spread of the entity, so a column added to the table is not silently
 * published. `viewerId` is whoever asked — null for a signed-out visitor.
 */
export function toPostSummaryDto(
  post: PostEntity,
  viewerId: string | null,
): PostSummaryDto {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    summary: post.summary,
    visibility: post.visibility,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    authorName: post.authorName,
    ownedByViewer: post.authorId === viewerId,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

/**
 * The whole post. `builds` are the linked builds this viewer may open, already
 * checked by the builds module; the raw link list goes only to the author, so
 * nobody else learns the id of a build its owner has made private.
 */
export function toPostDto(
  post: PostEntity,
  builds: readonly BuildDto[],
  viewerId: string | null,
): PostDto {
  const ownedByViewer = post.authorId === viewerId;

  return {
    ...toPostSummaryDto(post, viewerId),
    bodyMd: post.bodyMd,
    builds: [...builds],
    buildIds: ownedByViewer ? [...post.buildIds] : [],
  };
}

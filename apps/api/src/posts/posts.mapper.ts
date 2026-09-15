import type { BuildDto, PostDto, PostImageDto, PostSummaryDto } from '@spothub/shared';

import type { PostEntity } from './post.entity';

/**
 * The single place a post becomes a wire object. Explicit rather than a
 * spread of the entity, so a column added to the table is not silently
 * published. `viewerId` is whoever asked — null for a signed-out visitor.
 * Image URLs are signed per response by the media module and passed in.
 */
export function toPostSummaryDto(
  post: PostEntity,
  viewerId: string | null,
  coverUrl: string | null,
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
    coverUrl,
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
  images: readonly PostImageDto[],
  viewerId: string | null,
): PostDto {
  const ownedByViewer = post.authorId === viewerId;
  const cover = images.find((image) => image.id === post.coverAssetId) ?? null;

  return {
    ...toPostSummaryDto(post, viewerId, cover ? (cover.thumbUrl ?? cover.url) : null),
    bodyMd: post.bodyMd,
    coverAssetId: cover?.id ?? null,
    coverImageUrl: cover?.url ?? null,
    images: [...images],
    builds: [...builds],
    buildIds: ownedByViewer ? [...post.buildIds] : [],
  };
}

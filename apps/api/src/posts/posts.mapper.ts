import {
  type BuildDto,
  type HiddenPostDto,
  type LikesDto,
  type PostDto,
  type PostImageDto,
  type PostSummaryDto,
  type PostTagDto,
  type ResponsiveImageDto,
  readingMinutes,
} from '@spothub/shared';

import type { PostEntity } from './post.entity';

/**
 * The single place a post becomes a wire object. Explicit rather than a
 * spread of the entity, so a column added to the table is not silently
 * published. `viewerId` is whoever asked — null for a signed-out visitor.
 * Image URLs are signed per response by the media module, and the tags are
 * the linked builds the builds module says this viewer may open; those and
 * the likes are passed in.
 */
export function toPostSummaryDto(
  post: PostEntity,
  viewerId: string | null,
  cover: ResponsiveImageDto | null,
  tags: readonly PostTagDto[],
  likes: LikesDto,
): PostSummaryDto {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    summary: post.summary,
    visibility: post.visibility,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    authorName: post.authorName,
    authorPhotoUrl: post.authorPhotoUrl,
    ownedByViewer: post.authorId === viewerId,
    hidden: post.hiddenAt !== null,
    coverUrl: cover?.url ?? null,
    coverImage: cover,
    readingMinutes: readingMinutes(post.bodyMd),
    tags: [...tags],
    likes,
    commentCount: post.commentCount,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

/** A hidden post, as the Admin page lists it. */
export function toHiddenPostDto(post: PostEntity): HiddenPostDto {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    authorName: post.authorName ?? 'A pilot',
    hiddenAt: post.hiddenAt?.toISOString() ?? '',
  };
}

/** A build as a post's tag. */
export function toPostTag(build: BuildDto): PostTagDto {
  return { id: build.id, name: build.name, slug: build.slug };
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
  likes: LikesDto,
): PostDto {
  const ownedByViewer = post.authorId === viewerId;
  const cover = images.find((image) => image.id === post.coverAssetId) ?? null;

  return {
    ...toPostSummaryDto(
      post,
      viewerId,
      cover
        ? {
            url: cover.displayUrl ?? cover.url,
            thumbUrl: cover.thumbUrl,
            width: cover.width,
            height: cover.height,
          }
        : null,
      builds.map(toPostTag),
      likes,
    ),
    bodyMd: post.bodyMd,
    coverAssetId: cover?.id ?? null,
    // The display version: what the top of the post shows, and small enough
    // for any link preview, where a camera original could be too big.
    coverImageUrl: cover ? (cover.displayUrl ?? cover.url) : null,
    images: [...images],
    builds: [...builds],
    buildIds: ownedByViewer ? [...post.buildIds] : [],
  };
}

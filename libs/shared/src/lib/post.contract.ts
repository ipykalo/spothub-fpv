import { z } from 'zod';

import { buildSchema } from './build.contract';
import { Visibility } from './enums';
import { likesSchema } from './like.contract';

/**
 * Blog posts, defined once for both sides of the wire.
 *
 * A post is markdown a signed-in pilot wrote, optionally about some of their
 * own builds. Visibility works as it does for a build: Private is a draft only
 * its author sees, Unlisted opens for anyone with the link — signed in or
 * not — and Public is also listed on the blog. A post is published the first
 * time it leaves Private.
 *
 * Images live in our own storage, uploaded to the post, and the body refers to
 * one as `![caption](image:<asset id>)`. Readers' pages swap that for a URL;
 * an image at any other address is shown as a link, never loaded.
 */

export const MAX_POST_TITLE_LENGTH = 120;
export const MAX_POST_SUMMARY_LENGTH = 300;
export const MAX_POST_BODY_LENGTH = 50_000;
export const MAX_POST_BUILDS = 10;

/** The URL scheme a post's body uses for one of its own uploaded images. */
export const POST_IMAGE_SCHEME = 'image:';

const IMAGE_REFERENCE = /!\[[^\]]*\]\(image:([0-9a-f-]{36})\)/g;

/** The Markdown that shows one of the post's images, with a caption that cannot break it. */
export function postImageMarkdown(caption: string, assetId: string): string {
  return `![${caption.replace(/[[\]]/g, '')}](${POST_IMAGE_SCHEME}${assetId})`;
}

/**
 * Where a post's image is served from — an address that does not expire, which
 * the API answers with a redirect to storage.
 *
 * Presigned URLs are for rendering now: they expire within the hour, so they
 * cannot be a link preview's picture, a search engine's image, or the `src` of
 * a page somebody leaves open. This one is stable, and the API checks who may
 * read the post on every request, so a draft's image is still nobody else's.
 * The `/api` prefix is the same base the client asks everything else under.
 */
export function postImageUrl(
  postId: string,
  assetId: string,
  variant: 'full' | 'thumb' = 'full',
): string {
  return `/api/posts/${postId}/images/${assetId}/${variant === 'thumb' ? 'thumb' : 'file'}`;
}

/** Minutes to read a body at about 200 words a minute; never less than one. */
export function readingMinutes(bodyMd: string): number {
  const words = bodyMd.replace(IMAGE_REFERENCE, ' ').match(/\S+/g)?.length ?? 0;
  return Math.max(1, Math.round(words / 200));
}

/** The ids of the post's own images a body shows, in order. */
export function referencedImageIds(bodyMd: string): string[] {
  return [...bodyMd.matchAll(IMAGE_REFERENCE)].flatMap((match) =>
    match[1] ? [match[1]] : [],
  );
}

/**
 * The writable fields, without defaults — create adds them, because zod 4
 * applies a `.default()` even inside `.partial()` and a PATCH would otherwise
 * reset every field it did not name.
 */
const postFields = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Give the post a title')
    .max(
      MAX_POST_TITLE_LENGTH,
      `Keep the title under ${String(MAX_POST_TITLE_LENGTH)} characters`,
    ),
  /** A line or two for the blog list and link previews. An empty one is none. */
  summary: z
    .union([
      z
        .string()
        .trim()
        .max(
          MAX_POST_SUMMARY_LENGTH,
          `Keep the summary under ${String(MAX_POST_SUMMARY_LENGTH)} characters`,
        ),
      z.null(),
    ])
    .transform((value) => (value === '' ? null : value)),
  bodyMd: z
    .string()
    .max(
      MAX_POST_BODY_LENGTH,
      `Keep the post under ${String(MAX_POST_BODY_LENGTH)} characters`,
    ),
  visibility: z.enum(Visibility),
  /** Builds the post is about, in the order given. Only the author's own. */
  buildIds: z
    .array(z.uuid())
    .max(MAX_POST_BUILDS, `Link at most ${String(MAX_POST_BUILDS)} builds`)
    .refine((ids) => new Set(ids).size === ids.length, 'A build is linked twice'),
});

export const createPostSchema = postFields.extend({
  summary: postFields.shape.summary.default(null),
  bodyMd: postFields.shape.bodyMd.default(''),
  visibility: postFields.shape.visibility.default(Visibility.Private),
  buildIds: postFields.shape.buildIds.default([]),
});

/** Every field optional, but an empty PATCH is a client bug and is refused. */
export const updatePostSchema = postFields
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });

/** One image uploaded to a post, at addresses that do not expire (`postImageUrl`). */
export const postImageSchema = z.object({
  id: z.uuid(),
  url: z.string(),
  thumbUrl: z.string().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
});

/** A linked build as a tag on a post: enough to name it and link to its page. */
export const postTagSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
});

/** What the blog list shows: everything but the body and the linked builds in full. */
export const postSummarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  slug: z.string(),
  summary: z.string().nullable(),
  visibility: z.enum(Visibility),
  /** When it first left Private; null for a draft that never has. */
  publishedAt: z.string().nullable(),
  /** The author's display name. Never their email. */
  authorName: z.string().nullable(),
  /** Whether the person asking wrote it. Only its author can change it. */
  ownedByViewer: z.boolean(),
  /** The cover's thumbnail, for a list. A lasting address, so a card may be shared. */
  coverUrl: z.string().nullable(),
  /** Minutes to read the body. */
  readingMinutes: z.number().int(),
  /** The linked builds the person asking may open, as tags, in the author's order. */
  tags: z.array(postTagSchema),
  likes: likesSchema,
  /** Comments and replies on it, not counting what is left of a deleted one. */
  commentCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const postSchema = postSummarySchema.extend({
  bodyMd: z.string(),
  /** The cover the author chose, one of the post's own images. */
  coverAssetId: z.uuid().nullable(),
  /** The cover at full size, for the top of the post. */
  coverImageUrl: z.string().nullable(),
  /** The post's own images, which `image:` references in the body resolve to. */
  images: z.array(postImageSchema),
  /**
   * The linked builds the person asking may open, in the author's order. A
   * build its owner has since made private is left out for everyone else.
   */
  builds: z.array(buildSchema),
  /** Every linked build id, for the author's edit form. Empty for anyone else. */
  buildIds: z.array(z.uuid()),
});

export const listPublishedPostsQuerySchema = z.object({
  /** Only posts about this build. */
  buildId: z.uuid().optional(),
});

export type PostFormValue = z.input<typeof createPostSchema>;
export type CreatePostDto = z.output<typeof createPostSchema>;
export type UpdatePostDto = z.output<typeof updatePostSchema>;
export type PostImageDto = z.output<typeof postImageSchema>;
export type PostTagDto = z.output<typeof postTagSchema>;
export type PostSummaryDto = z.output<typeof postSummarySchema>;
export type PostDto = z.output<typeof postSchema>;
export type ListPublishedPostsQuery = z.output<typeof listPublishedPostsQuerySchema>;

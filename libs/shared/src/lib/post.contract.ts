import { z } from 'zod';

import { buildSchema } from './build.contract';
import { Visibility } from './enums';

/**
 * Blog posts, defined once for both sides of the wire.
 *
 * A post is markdown a signed-in pilot wrote, optionally about some of their
 * own builds. Visibility works as it does for a build: Private is a draft only
 * its author sees, Unlisted opens for anyone with the link — signed in or
 * not — and Public is also listed on the blog. A post is published the first
 * time it leaves Private.
 */

export const MAX_POST_TITLE_LENGTH = 120;
export const MAX_POST_SUMMARY_LENGTH = 300;
export const MAX_POST_BODY_LENGTH = 50_000;
export const MAX_POST_BUILDS = 10;

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

/** What the blog list shows: everything but the body and the linked builds. */
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
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const postSchema = postSummarySchema.extend({
  bodyMd: z.string(),
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
export type PostSummaryDto = z.output<typeof postSummarySchema>;
export type PostDto = z.output<typeof postSchema>;
export type ListPublishedPostsQuery = z.output<typeof listPublishedPostsQuerySchema>;

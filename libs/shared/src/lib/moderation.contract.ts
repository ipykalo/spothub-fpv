import { z } from 'zod';

import { reportSchema } from './report.contract';

/**
 * Moderation, defined once for both sides of the wire.
 *
 * An admin hides or deletes any post or comment, and hides every post a pilot
 * wrote at once. Hidden is not deleted: the words stay, read by nobody but a
 * post's own author, until an admin shows them again from the Admin page.
 */

/** An admin hides a post or a comment, or shows it again. */
export const setHiddenSchema = z.object({
  hidden: z.boolean(),
});

export type SetHiddenDto = z.output<typeof setHiddenSchema>;

/** How many of a pilot's posts an admin's hide-or-show-all changed. */
export const hiddenCountSchema = z.object({
  count: z.number().int(),
});

export type HiddenCountDto = z.output<typeof hiddenCountSchema>;

/** A hidden post, as the Admin page lists it. */
export const hiddenPostSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  slug: z.string(),
  /** Who wrote it, by their public name. */
  authorName: z.string(),
  hiddenAt: z.string(),
});

export type HiddenPostDto = z.output<typeof hiddenPostSchema>;

/** A hidden comment, as the Admin page lists it. */
export const hiddenCommentSchema = z.object({
  id: z.uuid(),
  /** The start of its words. */
  excerpt: z.string(),
  authorName: z.string(),
  /** The spot, build or post it is under — the same place a report names. */
  place: reportSchema.shape.place,
  hiddenAt: z.string(),
});

export type HiddenCommentDto = z.output<typeof hiddenCommentSchema>;

import { z } from 'zod';

/**
 * Likes, defined once for both sides of the wire.
 *
 * One heart per pilot per post or build: liked or not, and how many have. Anyone
 * who can open the post or build sees the count; liking needs signing in.
 */
export const likesSchema = z.object({
  count: z.number().int(),
  /** The person asking has liked it. Always false for a signed-out visitor. */
  likedByViewer: z.boolean(),
});

export type LikesDto = z.output<typeof likesSchema>;

/** What something nobody has liked answers with. */
export const NO_LIKES: LikesDto = { count: 0, likedByViewer: false };

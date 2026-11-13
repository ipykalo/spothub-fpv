import { z } from 'zod';

/**
 * The versions every uploaded image is stored in, by their longest edge. The
 * server makes them on commit; the client describes them in a `srcset`. One
 * place, so the widths a browser is told match the files it gets.
 */
export const THUMB_EDGE = 640;
export const DISPLAY_EDGE = 1600;

/**
 * The width of a version, from the original's size: scaled down to fit the
 * edge, never up. A `srcset` needs the real width — a portrait photo's 640 px
 * thumbnail is 480 px wide, and calling it 640 would have a browser pick it
 * where it is too small.
 */
export function scaledWidth(width: number, height: number, edge: number): number {
  const scale = Math.min(1, edge / Math.max(width, height));
  return Math.round(width * scale);
}

/**
 * An image in the sizes a browser may choose between: the display version
 * (the original until one is made) and the thumbnail, with the original's
 * size, from which each version's width follows. What a card's cover is.
 */
export const responsiveImageSchema = z.object({
  /** The display version, at most 1600 px — or the original until there is one. */
  url: z.string(),
  /** The 640 px thumbnail, when there is one. */
  thumbUrl: z.string().nullable(),
  /** The original's size; each version's own width is `scaledWidth` of it. */
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
});
export type ResponsiveImageDto = z.output<typeof responsiveImageSchema>;

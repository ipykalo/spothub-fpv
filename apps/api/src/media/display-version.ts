import { DISPLAY_EDGE } from '@spothub/shared';
import sharp from 'sharp';

/** A display version, ready to store. */
export interface MadeDisplay {
  readonly bytes: Buffer;
  readonly width: number;
  readonly height: number;
}

/** What `sharp().metadata()` says about an image's size and how it is turned. */
export interface ImageGeometry {
  readonly width?: number;
  readonly height?: number;
  readonly orientation?: number;
}

/**
 * An image's size the way it is seen: a phone held upright writes landscape
 * pixels and an EXIF orientation of 5 to 8 that says "turn me a quarter",
 * and the raw width and height then name the sides the wrong way round.
 * Every version is made turned (`rotate()`), so the original's recorded size
 * must be turned too, or a `srcset` would describe a portrait photo as
 * landscape. Null when the image gives no size.
 */
export function uprightSize(
  meta: ImageGeometry,
): { width: number; height: number } | null {
  if (!meta.width || !meta.height) {
    return null;
  }

  const quarterTurned = (meta.orientation ?? 1) >= 5;

  return quarterTurned
    ? { width: meta.height, height: meta.width }
    : { width: meta.width, height: meta.height };
}

/**
 * What a gallery, a viewer and a post body show instead of the original:
 * turned upright, at most 1600 px on its longest edge, WebP. Never enlarged —
 * a small original stays its own size, only re-encoded. Made from bytes that
 * have already lost their EXIF, or are about to: the re-encode carries none.
 *
 * Shared by the commit and the backfill, so a photo uploaded today and one
 * from before this existed get the same version.
 */
export async function makeDisplayVersion(original: Buffer): Promise<MadeDisplay> {
  const { data, info } = await sharp(original, { failOn: 'error' })
    .rotate()
    .resize(DISPLAY_EDGE, DISPLAY_EDGE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  return { bytes: data, width: info.width, height: info.height };
}

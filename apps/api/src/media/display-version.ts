import sharp from 'sharp';

/**
 * The longest edge of a display version, in pixels: sharp on a large phone
 * or a laptop, and a fraction of a camera original's bytes.
 */
export const DISPLAY_EDGE = 1600;

/** A display version, ready to store. */
export interface MadeDisplay {
  readonly bytes: Buffer;
  readonly width: number;
  readonly height: number;
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

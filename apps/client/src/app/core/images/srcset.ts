import {
  DISPLAY_EDGE,
  type ResponsiveImageDto,
  THUMB_EDGE,
  scaledWidth,
} from '@spothub/shared';

/** A photo as the gallery holds it: every version's address, and the original's size. */
export interface PhotoVersions {
  readonly url: string | null;
  readonly thumbUrl: string | null;
  readonly displayUrl?: string | null;
  readonly width: number | null;
  readonly height: number | null;
}

/**
 * The two sizes a browser may choose between, as a `srcset`: the thumbnail
 * and the larger version, each with its real width — so a phone takes the
 * 640 px thumbnail and a large or dense screen the 1600 px version. Null when
 * there is no choice to make: no thumbnail, no size known, or a photo small
 * enough that both are the same width.
 */
function srcset(
  thumbUrl: string | null,
  largeUrl: string | null,
  width: number | null,
  height: number | null,
  largeWidth: (width: number, height: number) => number,
): string | null {
  if (!thumbUrl || !largeUrl || !width || !height) {
    return null;
  }

  const small = scaledWidth(width, height, THUMB_EDGE);
  const large = largeWidth(width, height);

  return large > small
    ? `${thumbUrl} ${String(small)}w, ${largeUrl} ${String(large)}w`
    : null;
}

/**
 * A gallery photo's `srcset`. Its larger size is the display version, or the
 * original — at its own full width — until one is made.
 */
export function photoSrcset(photo: PhotoVersions): string | null {
  return photo.displayUrl
    ? srcset(photo.thumbUrl, photo.displayUrl, photo.width, photo.height, (w, h) =>
        scaledWidth(w, h, DISPLAY_EDGE),
      )
    : srcset(photo.thumbUrl, photo.url, photo.width, photo.height, (w) => w);
}

/** A card cover's `srcset`. Its `url` is the display version. */
export function coverSrcset(cover: ResponsiveImageDto): string | null {
  return srcset(cover.thumbUrl, cover.url, cover.width, cover.height, (w, h) =>
    scaledWidth(w, h, DISPLAY_EDGE),
  );
}

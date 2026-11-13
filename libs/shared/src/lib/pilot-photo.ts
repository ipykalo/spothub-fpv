/**
 * A pilot's profile photo: one square image they upload, shown beside their
 * name wherever others see it. Never their Google photo — this site does not
 * load anything from Google.
 */

/** The photo's side in pixels, as stored: a square WebP. */
export const PILOT_PHOTO_EDGE = 256;

/**
 * The lasting address of a pilot's photo, or null without one. The API
 * answers it with a redirect to a freshly signed link, so it can be put in a
 * page and cached; `v` changes with every new photo, so a replaced one is
 * never served from a cache.
 */
export function pilotPhotoUrl(
  userId: string,
  photoAssetId: string | null,
): string | null {
  return photoAssetId === null ? null : `/api/users/${userId}/photo?v=${photoAssetId}`;
}

/** What uploading or removing a photo answers: the address to show now. */
export interface PilotPhotoDto {
  readonly photoUrl: string | null;
}

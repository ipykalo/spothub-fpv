/** What a photo can be shown from: its display version, else its full image, else its thumbnail. */
interface Showable {
  readonly displayUrl?: string | null;
  readonly url: string | null;
  readonly thumbUrl: string | null;
}

/**
 * The images either side of the one showing, wrapping round as next and
 * previous do, so they can be fetched before they are asked for and a step
 * through the photos shows each at once. Nothing for a single photo.
 */
export function neighbourPhotoUrls(photos: readonly Showable[], index: number): string[] {
  const count = photos.length;

  if (count < 2) {
    return [];
  }

  const urls = [photos[(index + 1) % count], photos[(index - 1 + count) % count]]
    .map((photo) => photo.displayUrl ?? photo.url ?? photo.thumbUrl)
    .filter((url): url is string => url !== null);

  return [...new Set(urls)];
}

/** How many photos either side of the one showing are fetched ahead. */
export const NEIGHBOUR_REACH = 2;

/**
 * The photos either side of the one showing, nearest first — next, previous,
 * the one after next, the one before previous — wrapping round as next and
 * previous do, so they can be fetched before they are asked for and a step,
 * or two quick steps, through the photos shows each at once. Each photo once,
 * never the one showing; nothing for a single photo.
 */
export function neighbourPhotos<T extends { readonly id: string }>(
  photos: readonly T[],
  index: number,
  reach = NEIGHBOUR_REACH,
): T[] {
  const count = photos.length;

  if (count < 2) {
    return [];
  }

  const showing = photos[index]?.id;
  const found = new Map<string, T>();

  for (let distance = 1; distance <= reach; distance += 1) {
    for (const at of [index + distance, index - distance]) {
      const photo = photos[((at % count) + count) % count];

      if (photo.id !== showing) {
        found.set(photo.id, photo);
      }
    }
  }

  return [...found.values()];
}

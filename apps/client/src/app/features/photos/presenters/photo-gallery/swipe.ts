/** How far a finger must travel sideways before it counts as a swipe, in CSS pixels. */
const MIN_DISTANCE = 40;

/** Longer than this and it was a slow drag or a pause, not a swipe. */
const MAX_DURATION_MS = 800;

/**
 * Which way a touch moved the photos: 1 for the next one (the finger went
 * left, pulling the next photo in), -1 for the previous, 0 for a tap, a
 * scroll or anything too slow or too short to be meant. A movement more up
 * than across is the page scrolling and is left alone.
 */
export function swipeStep(dx: number, dy: number, durationMs: number): -1 | 0 | 1 {
  if (durationMs > MAX_DURATION_MS || Math.abs(dx) < MIN_DISTANCE) {
    return 0;
  }

  if (Math.abs(dx) < Math.abs(dy) * 1.5) {
    return 0;
  }

  return dx < 0 ? 1 : -1;
}

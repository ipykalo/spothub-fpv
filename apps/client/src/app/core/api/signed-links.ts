import { DOCUMENT, DestroyRef, inject } from '@angular/core';

/**
 * Keeps a page's signed image addresses working however long it stays open.
 *
 * Photos, thumbnails and covers come with presigned addresses that last an
 * hour and are always handed out with at least 45 minutes left (the API's
 * `stable-signing.ts`). A page loads them once, so one left open past that
 * shows broken images the next time it is used — the first photo a reader
 * steps to, after an hour in another tab. The fix is to ask again, which is
 * one small list request:
 *
 * - when the reader comes back to a tab that was hidden for ten minutes or
 *   more, before anything is clicked;
 * - when an image fails to load anyway, which also covers a page kept in
 *   front the whole time. At most once every 30 seconds, so a whole strip of
 *   thumbnails failing together is one request, and an image that is really
 *   gone cannot loop.
 *
 * Downloading every full-size photo up front would hide the expiry only in
 * the gallery, cost a phone tens of megabytes, and still break once the
 * browser let go of them.
 */
export const AWAY_BEFORE_REFRESH_MS = 10 * 60_000;
export const MIN_REFRESH_GAP_MS = 30_000;

/** Whether a tab hidden at `hiddenAt` has been away long enough to ask again. */
export function awayLongEnough(hiddenAt: number | null, now: number): boolean {
  return hiddenAt !== null && now - hiddenAt >= AWAY_BEFORE_REFRESH_MS;
}

/** Lets a refresh through at most once per `MIN_REFRESH_GAP_MS`. */
export class RefreshGate {
  private last = Number.NEGATIVE_INFINITY;

  allow(now: number): boolean {
    if (now - this.last < MIN_REFRESH_GAP_MS) {
      return false;
    }

    this.last = now;
    return true;
  }
}

/**
 * Call from a container's injection context with how to reload its addresses.
 * Returns the handler for an image's `(error)`; the return to the tab is
 * watched until the container is destroyed.
 */
export function refreshSignedLinks(refresh: () => void): () => void {
  const document = inject(DOCUMENT);
  const gate = new RefreshGate();
  let hiddenAt: number | null = null;

  const run = (): void => {
    if (gate.allow(Date.now())) {
      refresh();
    }
  };

  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }

    const wasAway = awayLongEnough(hiddenAt, Date.now());
    hiddenAt = null;

    if (wasAway) {
      run();
    }
  };

  // On the server there is no tab to come back to; addEventListener still
  // exists on Domino's document and simply never fires.
  document.addEventListener('visibilitychange', onVisibility);
  inject(DestroyRef).onDestroy(() => {
    document.removeEventListener('visibilitychange', onVisibility);
  });

  return run;
}

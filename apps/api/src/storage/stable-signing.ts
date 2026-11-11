/**
 * When to sign a download address so the same object keeps the same address
 * for a while, and how long the browser may keep what it fetched.
 *
 * Time is cut into windows of a quarter of the address's lifetime. Everything
 * signed within one window is signed as at its start, so it comes out
 * identical; and since an address lives for the whole lifetime, one handed
 * out at the very end of a window still has three quarters of it left — 45
 * minutes of an hour. A page left open longer than that asks again
 * (`core/api/signed-links.ts` on the client).
 *
 * The browser may keep the image for those three quarters: a fixed figure,
 * because anything that changed from one second to the next would change the
 * address with it and undo the point. It never holds an image past its
 * signature.
 */
export function stableSigning(
  nowMs: number,
  expiresInSeconds: number,
): { readonly signedAt: Date; readonly cacheSeconds: number } {
  const windowSeconds = Math.max(1, Math.floor(expiresInSeconds / 4));
  const windowMs = windowSeconds * 1000;

  return {
    signedAt: new Date(Math.floor(nowMs / windowMs) * windowMs),
    cacheSeconds: Math.max(1, expiresInSeconds - windowSeconds),
  };
}

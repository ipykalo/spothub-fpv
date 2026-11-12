/**
 * The Content-Security-Policy every page is served with, and the nonce that
 * lets the page's own inline scripts through.
 *
 * Pure, and apart from `server.ts`, so a spec can read it without starting
 * express. `server.ts` mints a fresh nonce per response, swaps it in for the
 * placeholder, and sends the header.
 */

/**
 * Written into `index.html` as `ngCspNonce`. The build copies it onto every
 * `<script>` and `<style>` it emits — the theme script, the event-replay
 * contract — and Angular's server rendering onto the ones it adds: the
 * replayed events, the critical-CSS loader. So one swap reaches them all.
 */
export const NONCE_PLACEHOLDER = 'sh-csp-nonce-placeholder';

/**
 * Swaps the placeholder for `nonce`, but only as the value of a `nonce` or
 * `ngCspNonce` attribute: a post that happens to quote the placeholder in
 * its text must not have the real nonce written into the page for it.
 */
export function withNonce(html: string, nonce: string): string {
  return html.replace(
    new RegExp(`(\\s(?:nonce|ngcspnonce)=")${NONCE_PLACEHOLDER}"`, 'gi'),
    `$1${nonce}"`,
  );
}

export interface PolicySources {
  /** Fresh for each response. */
  readonly nonce: string;
  /**
   * Where photos are read from and uploads go to — the presigned addresses'
   * own origin, `https://<STORAGE_DOMAIN>` in production.
   */
  readonly storageOrigin: string;
}

/**
 * Scripts are the strict part: this site's own files, and inline only with
 * the nonce, so injected markup cannot run. Styles allow inline, because
 * Angular, Material and Leaflet all write styles at runtime and a style
 * cannot exfiltrate anything a script could.
 */
export function contentSecurityPolicy({ nonce, storageOrigin }: PolicySources): string {
  const directives: Record<string, readonly string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", `'nonce-${nonce}'`],
    'style-src': ["'self'", "'unsafe-inline'"],
    // Photo previews are object URLs; the map's tiles come from OpenStreetMap.
    'img-src': [
      "'self'",
      'data:',
      'blob:',
      'https://tile.openstreetmap.org',
      storageOrigin,
    ],
    'font-src': ["'self'", 'data:'],
    // Uploads go straight to storage on a presigned PUT.
    'connect-src': ["'self'", storageOrigin],
    // The click-to-play video player, and nothing else.
    'frame-src': ['https://www.youtube-nocookie.com'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'self'"],
  };

  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(' ')}`)
    .join('; ');
}

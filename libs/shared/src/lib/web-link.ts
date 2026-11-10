import { z } from 'zod';

/**
 * A link a pilot pastes to a shop or a listing: a web address and nothing
 * else. `https://` or `http://` and a real domain name — never `javascript:`,
 * `data:` or `file:`, which a browser would run or open rather than visit,
 * and never a bare IP address or a name with no dot, which is not a shop.
 */
export const webLinkSchema = z
  .string()
  .trim()
  .max(2000, 'That link is too long')
  .pipe(
    z.url({
      protocol: /^https?$/,
      hostname: z.regexes.domain,
      error: 'Paste a web address starting with https://',
    }),
  );

/** A web link, or `''` / null for none — what an optional link field holds. */
export const optionalWebLinkSchema = z
  .union([z.literal(''), z.null(), webLinkSchema])
  .transform((value) => (value === null || value === '' ? null : value));

/**
 * The site a link goes to, as a reader should see it before following it:
 * `aliexpress.com` for `https://www.aliexpress.com/item/…`. Null for anything
 * that is not a web address, which is then not shown as a link at all.
 */
export function linkHost(href: string): string | null {
  let url: URL;

  try {
    url = new URL(href);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return null;
  }

  return url.hostname.replace(/^www\./, '') || null;
}

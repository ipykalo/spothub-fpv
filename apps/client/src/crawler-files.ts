/**
 * `robots.txt` and `sitemap.xml`, built as text.
 *
 * Apart from `server.ts` itself, which is express wiring and an Angular
 * engine, because what these two files say is the whole of the site's
 * relationship with a crawler and is worth testing on its own — the same
 * reason `packStats` sits beside the component that renders it rather than
 * inside it. Nothing here touches express, Node or the network.
 */

/** The blog changes a few times a week; a crawler need not cost a query each time. */
export const SITEMAP_TTL_MS = 5 * 60 * 1000;

/**
 * What a crawler may walk: the blog, and nothing else. Everything behind
 * sign-in answers a redirect to the login page, which is a waste of a crawl
 * and of the crawler's opinion of the site, so it is named here as off-limits.
 */
const DISALLOWED = [
  '/hangar',
  '/parts',
  '/flights',
  '/spots',
  '/posts',
  '/login',
  '/auth',
  '/api',
];

/** What a request says about where the site was reached, headers included. */
export interface RequestOrigin {
  readonly protocol: string;
  readonly host: string | undefined;
  readonly forwardedProto: string | undefined;
  readonly forwardedHost: string | undefined;
}

/** A published post, as the sitemap needs it. */
export interface SitemapPost {
  readonly id: string;
  readonly slug: string;
  readonly updatedAt: string;
}

/**
 * The site's own address, as the visitor reached it. Behind a reverse proxy
 * the scheme and host arrive in `X-Forwarded-*`, each possibly a list of the
 * proxies crossed, of which the first is the client's own. Angular's
 * allowed-hosts check is what keeps a forged Host out of what we publish.
 */
export function siteOrigin(request: RequestOrigin): string {
  const scheme = first(request.forwardedProto) ?? request.protocol;
  const host = first(request.forwardedHost) ?? request.host ?? 'localhost';

  return `${scheme}://${host}`;
}

export function robotsTxt(origin: string): string {
  return [
    'User-agent: *',
    ...DISALLOWED.map((path) => `Disallow: ${path}`),
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}

/**
 * Every address a search engine should know: the blog, and each published
 * post at its own canonical address, with the day it last changed. The feed
 * itself is dated by the newest post on it, since that is when it changed.
 */
export function sitemapXml(origin: string, posts: readonly SitemapPost[]): string {
  const newest =
    posts
      .map((post) => post.updatedAt)
      .sort()
      .at(-1) ?? null;

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entry(origin, newest),
    ...posts.map((post) =>
      entry(`${origin}/blog/${post.id}/${post.slug}`, post.updatedAt),
    ),
    '</urlset>',
    '',
  ].join('\n');
}

function entry(url: string, lastModified: string | null): string {
  const day = lastModified === null ? null : lastModified.slice(0, 10);

  return [
    '  <url>',
    `    <loc>${xmlText(url)}</loc>`,
    ...(day === null ? [] : [`    <lastmod>${day}</lastmod>`]),
    '  </url>',
  ].join('\n');
}

function xmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The first entry of a comma-separated proxy header, which is the client's own. */
function first(header: string | undefined): string | undefined {
  const value = header?.split(',')[0]?.trim();

  return value === undefined || value.length === 0 ? undefined : value;
}

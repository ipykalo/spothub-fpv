import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import type { PostSummaryDto } from '@spothub/shared';
import express from 'express';
import { join } from 'node:path';

/**
 * The client's server: static files, and the Angular app rendered per request.
 *
 * The API is not served from here. In production the reverse proxy sends
 * `/api` to the API container and everything else to this one; in development
 * the Angular dev server proxies `/api` itself and calls `reqHandler` below.
 */
const browserDistFolder = join(import.meta.dirname, '../browser');

/**
 * Angular refuses a request whose Host header is not an allowed hostname, so a
 * forged one cannot steer what the server fetches while rendering. `localhost`
 * covers running the built server on a laptop; the site's own domain is added
 * on deploy through Angular's `NG_ALLOWED_HOSTS` (comma-separated).
 */
const app = express();
const angularApp = new AngularNodeAppEngine({ allowedHosts: ['localhost'] });

/**
 * Where this server reaches the API, as the rendering does: the API's own
 * address inside the network, never the public site.
 */
const apiOrigin = process.env['API_INTERNAL_ORIGIN'] ?? 'http://localhost:3000';

/** The blog changes a few times a week; a crawler need not cost a query each time. */
const SITEMAP_TTL_MS = 5 * 60 * 1000;
let sitemap: { readonly xml: string; readonly at: number } | null = null;

/**
 * The site's own address, as the visitor reached it. Behind a reverse proxy
 * the scheme and host arrive in `X-Forwarded-*`; Angular's allowed-hosts check
 * is what keeps a forged Host out of the addresses we publish.
 */
function siteOrigin(req: express.Request): string {
  const forwardedProto = req.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const host = req.get('x-forwarded-host')?.split(',')[0]?.trim() ?? req.get('host');

  return `${forwardedProto ?? req.protocol}://${host ?? 'localhost'}`;
}

function xmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * What a crawler may walk: the blog, and nothing else. Everything behind
 * sign-in answers a redirect to the login page, which is a waste of a crawl
 * and of the crawler's opinion of the site, so it is named here as off-limits.
 */
app.get('/robots.txt', (req, res) => {
  const lines = [
    'User-agent: *',
    ...[
      '/hangar',
      '/parts',
      '/flights',
      '/spots',
      '/posts',
      '/login',
      '/auth',
      '/api',
    ].map((path) => `Disallow: ${path}`),
    '',
    `Sitemap: ${siteOrigin(req)}/sitemap.xml`,
    '',
  ];

  res.type('text/plain').send(lines.join('\n'));
});

/**
 * Every address a search engine should know: the blog, and each published
 * post at its own canonical address, with the day it last changed.
 */
app.get('/sitemap.xml', (req, res, next) => {
  const send = (xml: string): void => {
    res.type('application/xml').send(xml);
  };

  if (sitemap && Date.now() - sitemap.at < SITEMAP_TTL_MS) {
    send(sitemap.xml);
    return;
  }

  fetch(`${apiOrigin}/api/posts/published`)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`The API answered ${String(response.status)}`);
      }

      const posts = (await response.json()) as PostSummaryDto[];
      const origin = siteOrigin(req);
      const urls = [
        entry(
          origin,
          posts
            .map((post) => post.updatedAt)
            .sort()
            .at(-1) ?? null,
        ),
        ...posts.map((post) =>
          entry(`${origin}/blog/${post.id}/${post.slug}`, post.updatedAt),
        ),
      ];
      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...urls,
        '</urlset>',
        '',
      ].join('\n');

      sitemap = { xml, at: Date.now() };
      send(xml);
    })
    .catch(next);
});

function entry(url: string, lastModified: string | null): string {
  const day = lastModified === null ? null : lastModified.slice(0, 10);

  return [
    '  <url>',
    `    <loc>${xmlText(url)}</loc>`,
    ...(day === null ? [] : [`    <lastmod>${day}</lastmod>`]),
    '  </url>',
  ].join('\n');
}

/**
 * Hashed build artefacts, cached for a year. `index: false` so a request for
 * `/` is rendered below rather than answered with the bare shell.
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/** Everything else: rendered on the server for public pages, the browser shell for the rest. */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then(async (response) => {
      if (response) {
        await writeResponseToNodeResponse(response, res);
      } else {
        next();
      }
    })
    .catch(next);
});

if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] ?? 4000;

  app.listen(port, () => {
    process.stdout.write(`Client server listening on http://localhost:${String(port)}\n`);
  });
}

/** Used by the Angular CLI for the dev server and during the build. */
export const reqHandler = createNodeRequestHandler(app);

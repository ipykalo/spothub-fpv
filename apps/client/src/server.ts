import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';

import {
  SITEMAP_TTL_MS,
  type SitemapPost,
  robotsTxt,
  siteOrigin,
  sitemapXml,
} from './crawler-files';

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

let sitemap: { readonly xml: string; readonly at: number } | null = null;

/** Where the visitor reached the site, as express reports it. */
function originOf(req: express.Request): string {
  return siteOrigin({
    protocol: req.protocol,
    host: req.get('host'),
    forwardedProto: req.get('x-forwarded-proto'),
    forwardedHost: req.get('x-forwarded-host'),
  });
}

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(robotsTxt(originOf(req)));
});

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

      const posts = (await response.json()) as SitemapPost[];
      const xml = sitemapXml(originOf(req), posts);

      sitemap = { xml, at: Date.now() };
      send(xml);
    })
    .catch(next);
});

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

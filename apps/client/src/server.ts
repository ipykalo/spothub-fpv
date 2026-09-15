import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
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

import { ɵHTTP_ROOT_INTERCEPTOR_FNS as HTTP_ROOT_INTERCEPTOR_FNS } from '@angular/common/http';
import { type ApplicationConfig, mergeApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';

import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { SERVER_API_ORIGIN } from './core/api/api.tokens';
import { serverApiInterceptor } from './core/api/server-api.interceptor';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    // Where the rendering server reaches the API. In a container that is the
    // API's own service name, not the public site: going out through the proxy
    // and back in would need the server to resolve and reach its own domain.
    // The dev server and the API share a machine, so localhost is the default.
    {
      provide: SERVER_API_ORIGIN,
      useFactory: () => process.env['API_INTERNAL_ORIGIN'] ?? 'http://localhost:3000',
    },
    // A root interceptor, not one in `withInterceptors`: those run first, and
    // this one must run after the response cache has keyed the request by its
    // `/api/...` URL — the key the browser looks the response up by. Rewritten
    // any earlier, every response is fetched a second time once the page has
    // loaded. Angular's server platform registers its own URL handling through
    // this same token; it is the only way to sit behind the cache.
    { provide: HTTP_ROOT_INTERCEPTOR_FNS, useValue: serverApiInterceptor, multi: true },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);

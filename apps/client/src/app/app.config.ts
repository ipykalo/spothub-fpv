import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  type ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { appRoutes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Zoneless: change detection is driven by signals rather than by patching
    // every async API. Requires zone.js to be absent from the polyfills.
    provideZonelessChangeDetection(),
    // Deprecated in Angular 20.2 in favour of `animate.enter`/`animate.leave`,
    // but Angular Material still relies on the animations provider. Revisit
    // when Material drops the dependency (targeted for v23).
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    provideAnimationsAsync(),
    provideRouter(appRoutes, withComponentInputBinding()),
    // A public page rendered on the server is picked up where it stands rather
    // than drawn again, and the API responses it was rendered from travel with
    // it, so the browser does not fetch them twice. A click before the app has
    // loaded is replayed once it has.
    provideClientHydration(withEventReplay()),
    // Fetch is the default backend, which is also what the server needs. The
    // server adds one more interceptor of its own (`app.config.server.ts`).
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
};

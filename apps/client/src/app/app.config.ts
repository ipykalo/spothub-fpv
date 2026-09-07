import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  type ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
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
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
};

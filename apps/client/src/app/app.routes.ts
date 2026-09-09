import { type Route } from '@angular/router';

import { authGuard, guestGuard } from './core/auth/auth.guard';

/**
 * Every route is lazily loaded, so the login screen does not ship the hangar
 * and the initial bundle stays small.
 */
export const appRoutes: Route[] = [
  { path: '', pathMatch: 'full', redirectTo: 'hangar' },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/containers/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./features/auth/containers/auth-callback.page').then(
        (m) => m.AuthCallbackPage,
      ),
  },
  {
    path: 'hangar',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/builds/containers/builds-list.page').then(
            (m) => m.BuildsListPage,
          ),
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./features/builds/containers/build-form.page').then(
            (m) => m.BuildFormPage,
          ),
      },
      {
        // The build page proper: components, cost, history. The form moved to
        // /edit so this route can be what "open the build" means.
        path: ':id',
        loadComponent: () =>
          import('./features/builds/containers/build-detail.page').then(
            (m) => m.BuildDetailPage,
          ),
      },
      {
        path: ':id/edit',
        loadComponent: () =>
          import('./features/builds/containers/build-form.page').then(
            (m) => m.BuildFormPage,
          ),
      },
      {
        // Its own route: a side-by-side diff wants the full width, and the
        // build page is already long.
        path: ':id/compare',
        loadComponent: () =>
          import('./features/builds/containers/config-compare.page').then(
            (m) => m.ConfigComparePage,
          ),
      },
    ],
  },
  {
    path: 'parts',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/parts/containers/parts-list.page').then(
            (m) => m.PartsListPage,
          ),
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./features/parts/containers/part-form.page').then(
            (m) => m.PartFormPage,
          ),
      },
      {
        // Read-only view. The card clamps a listing title to two lines and
        // shows four attributes; this is where the whole part lives.
        path: ':id',
        loadComponent: () =>
          import('./features/parts/containers/part-detail.page').then(
            (m) => m.PartDetailPage,
          ),
      },
      {
        path: ':id/edit',
        loadComponent: () =>
          import('./features/parts/containers/part-form.page').then(
            (m) => m.PartFormPage,
          ),
      },
    ],
  },
  { path: '**', redirectTo: 'hangar' },
];

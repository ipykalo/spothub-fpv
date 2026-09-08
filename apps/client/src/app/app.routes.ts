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
        path: ':id',
        loadComponent: () =>
          import('./features/builds/containers/build-form.page').then(
            (m) => m.BuildFormPage,
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
        path: ':id',
        loadComponent: () =>
          import('./features/parts/containers/part-form.page').then(
            (m) => m.PartFormPage,
          ),
      },
    ],
  },
  { path: '**', redirectTo: 'hangar' },
];

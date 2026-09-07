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
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./features/auth/auth-callback.page').then((m) => m.AuthCallbackPage),
  },
  {
    path: 'hangar',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/builds/builds-list.page').then((m) => m.BuildsListPage),
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./features/builds/build-form.page').then((m) => m.BuildFormPage),
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./features/builds/build-form.page').then((m) => m.BuildFormPage),
      },
    ],
  },
  { path: '**', redirectTo: 'hangar' },
];

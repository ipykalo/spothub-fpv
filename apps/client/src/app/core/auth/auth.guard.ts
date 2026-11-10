import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';

import { AuthStore } from './auth.store';

/** Blocks a route until the session is known, then admits or redirects. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthStore);
  const router = inject(Router);

  await auth.restoreSession();

  return (
    auth.isAuthenticated() ||
    router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } })
  );
};

/**
 * The Admin page, for admins only. Anyone else signed in is sent to their
 * hangar; a visitor is sent to sign in first. Hiding the page is a courtesy —
 * the API refuses its requests to anyone but an admin regardless.
 */
export const adminGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthStore);
  const router = inject(Router);

  await auth.restoreSession();

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }

  return auth.isAdmin() || router.createUrlTree(['/hangar']);
};

/** Keeps a signed-in user off the login page. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthStore);
  const router = inject(Router);

  await auth.restoreSession();

  return !auth.isAuthenticated() || router.createUrlTree(['/hangar']);
};

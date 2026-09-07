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

/** Keeps a signed-in user off the login page. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthStore);
  const router = inject(Router);

  await auth.restoreSession();

  return !auth.isAuthenticated() || router.createUrlTree(['/hangar']);
};

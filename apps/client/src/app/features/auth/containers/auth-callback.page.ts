import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';

import { AuthStore } from '../../../core/auth/auth.store';

/**
 * Lands from the OAuth redirect, reads the token out of the URL fragment and
 * clears it from history so it does not sit in the address bar or get shared.
 */
@Component({
  selector: 'sh-auth-callback-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatProgressSpinnerModule],
  templateUrl: './auth-callback.page.html',
  styleUrl: './auth-callback.page.scss',
})
export class AuthCallbackPage {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly failed = signal(false);

  constructor() {
    void this.complete();
  }

  private async complete(): Promise<void> {
    const fragment = new URLSearchParams(globalThis.location.hash.replace(/^#/, ''));
    const token = fragment.get('access_token');

    if (!token) {
      this.failed.set(true);
      return;
    }

    // Drop the fragment before anything can read it back out of the URL.
    globalThis.history.replaceState(null, '', globalThis.location.pathname);

    await this.auth.adoptToken(token);

    const returnUrl = globalThis.sessionStorage.getItem('spothub:returnUrl');
    globalThis.sessionStorage.removeItem('spothub:returnUrl');

    await this.router.navigateByUrl(returnUrl ?? '/hangar');
  }
}

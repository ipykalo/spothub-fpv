import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';

import { API_BASE_URL } from '../../core/api/api.tokens';

@Component({
  selector: 'sh-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatCardModule, MatIconModule],
  styles: `
    :host {
      display: grid;
      place-items: center;
      min-height: 100dvh;
      padding: 1.5rem;
    }

    mat-card {
      max-width: 26rem;
      width: 100%;
    }

    .tagline {
      color: var(--mat-sys-on-surface-variant);
      margin: 0 0 1.5rem;
    }
  `,
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>SpotHub FPV</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <p class="tagline">Your hangar: what you built, what's in it, what it cost.</p>
        <button matButton="filled" type="button" (click)="signIn()">
          <mat-icon>login</mat-icon>
          Continue with Google
        </button>
      </mat-card-content>
    </mat-card>
  `,
})
export class LoginPage {
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly route = inject(ActivatedRoute);

  /**
   * A full navigation rather than an XHR: the OAuth flow needs the browser to
   * follow redirects to Google and back.
   */
  signIn(): void {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    const target = new URL(`${this.baseUrl}/auth/google`, globalThis.location.origin);

    if (returnUrl) {
      globalThis.sessionStorage.setItem('spothub:returnUrl', returnUrl);
    }

    globalThis.location.assign(target.toString());
  }
}

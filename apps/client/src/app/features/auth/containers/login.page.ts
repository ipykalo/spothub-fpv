import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';

import { API_BASE_URL } from '../../../core/api/api.tokens';

@Component({
  selector: 'sh-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatCardModule, MatIconModule],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
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

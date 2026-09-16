import { PlatformLocation } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { AuthStore } from './core/auth/auth.store';
import { ThemeStore } from './core/theme/theme.store';
import { CommentsStore } from './features/comments/comments.store';

/** The pages anyone may open, signed in or not: the blog feed at the root, and a post. */
const PUBLIC_PAGE = /^\/(?:$|[?#]|blog(?:[/?#]|$))/;

@Component({
  selector: 'sh-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, MatToolbarModule, MatButtonModule, MatIconModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly auth = inject(AuthStore);
  protected readonly theme = inject(ThemeStore);
  protected readonly comments = inject(CommentsStore);
  private readonly router = inject(Router);

  /**
   * The address being shown. It starts from the platform rather than the
   * router, which has not navigated yet when this first renders: that way the
   * server's page and the browser's first render of it agree on which header
   * to show.
   */
  protected readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: inject(PlatformLocation).pathname },
  );

  /** A visitor on a public page gets the public header instead of the app's toolbar. */
  protected readonly isPublicPage = computed(() => PUBLIC_PAGE.test(this.url()));

  constructor() {
    // The app's own routes and the login page restore the session in their
    // guards; a public page has none, so it is restored here — once the page
    // is in the browser, since the server never holds a session. Only there:
    // on the sign-in callback a failed refresh would race the token being
    // handed over, and could clear it.
    afterNextRender(() => {
      if (this.isPublicPage()) {
        void this.auth.restoreSession();
      }
    });

    // The Hangar and Spots badges, as soon as someone is known to be signed in,
    // and again on every page change: one small query, and a page change is
    // exactly when someone would look for them to have moved.
    effect(() => {
      if (this.auth.isAuthenticated()) {
        untracked(() => void this.comments.loadUnread());
      }
    });

    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        if (this.auth.isAuthenticated()) {
          void this.comments.loadUnread();
        }
      });
  }

  protected async signOut(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}

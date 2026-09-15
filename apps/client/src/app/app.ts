import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { AuthStore } from './core/auth/auth.store';
import { ThemeStore } from './core/theme/theme.store';
import { CommentsStore } from './features/comments/comments.store';

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

  constructor() {
    // The Hangar and Spots badges are asked for on every page change: one small
    // query, and a page change is exactly when someone would look for them to
    // have moved.
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

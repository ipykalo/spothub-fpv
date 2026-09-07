import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterLink, RouterOutlet } from '@angular/router';

import { AuthStore } from './core/auth/auth.store';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, MatToolbarModule, MatButtonModule, MatIconModule],
  styles: `
    .spacer {
      flex: 1 1 auto;
    }

    main {
      padding: 1.5rem;
      max-width: 72rem;
      margin: 0 auto;
    }

    .brand {
      text-decoration: none;
      color: inherit;
      font-weight: 600;
    }
  `,
  template: `
    @if (auth.isAuthenticated()) {
      <mat-toolbar>
        <a class="brand" routerLink="/hangar">SpotHub FPV</a>
        <span class="spacer"></span>
        <span>{{ auth.displayName() }}</span>
        <button matIconButton type="button" aria-label="Sign out" (click)="signOut()">
          <mat-icon>logout</mat-icon>
        </button>
      </mat-toolbar>
    }

    <main>
      <router-outlet />
    </main>
  `,
})
export class App {
  protected readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  protected async signOut(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}

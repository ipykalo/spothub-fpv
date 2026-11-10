import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import {
  type AccessTokenDto,
  type CurrentUserDto,
  type PilotNameDto,
  Role,
  UserStatus,
} from '@spothub/shared';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../api/api.tokens';

/**
 * Holds the session.
 *
 * The access token lives in memory only — never localStorage, which is
 * readable by any injected script. It is refreshed from the httpOnly cookie on
 * page load and whenever a request comes back 401.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  private readonly accessToken = signal<string | null>(null);
  private readonly currentUser = signal<CurrentUserDto | null>(null);
  private readonly initialised = signal(false);

  /** In-flight refresh, so concurrent 401s trigger exactly one round trip. */
  private refreshInFlight: Promise<boolean> | null = null;

  readonly user = this.currentUser.asReadonly();
  readonly ready = this.initialised.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  /** Shows the Admin page. The API checks the role again on every request. */
  readonly isAdmin = computed(() => this.currentUser()?.role === Role.Admin);
  /** An admin made this account read-only; the API refuses its writes. */
  readonly isReadOnly = computed(
    () => this.currentUser()?.status === UserStatus.Restricted,
  );
  /** The name the toolbar shows: the same one every other pilot sees. */
  readonly displayName = computed(() => {
    const user = this.currentUser();
    return user?.publicName ?? user?.displayName ?? user?.email ?? '';
  });

  /** Takes a changed pilot name, so the toolbar shows it at once. */
  applyPilotName(name: PilotNameDto): void {
    this.currentUser.update((user) => (user ? { ...user, ...name } : user));
  }

  token(): string | null {
    return this.accessToken();
  }

  /** Called once at startup to restore a session from the refresh cookie. */
  async restoreSession(): Promise<void> {
    if (this.initialised()) {
      return;
    }

    await this.refresh();
    this.initialised.set(true);
  }

  /** Adopts a token handed back by the OAuth callback redirect. */
  async adoptToken(token: string): Promise<void> {
    this.accessToken.set(token);
    await this.loadCurrentUser();
    this.initialised.set(true);
  }

  /** Exchanges the refresh cookie for a new access token. */
  refresh(): Promise<boolean> {
    this.refreshInFlight ??= this.performRefresh().finally(() => {
      this.refreshInFlight = null;
    });

    return this.refreshInFlight;
  }

  async logout(): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.baseUrl}/auth/logout`, {}, { withCredentials: true }),
    ).catch(() => undefined);

    this.accessToken.set(null);
    this.currentUser.set(null);
  }

  private async performRefresh(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.http.post<AccessTokenDto>(
          `${this.baseUrl}/auth/refresh`,
          {},
          { withCredentials: true },
        ),
      );

      this.accessToken.set(response.accessToken);
      await this.loadCurrentUser();

      return true;
    } catch {
      this.accessToken.set(null);
      this.currentUser.set(null);

      return false;
    }
  }

  private async loadCurrentUser(): Promise<void> {
    try {
      const user = await firstValueFrom(
        this.http.get<CurrentUserDto>(`${this.baseUrl}/auth/me`),
      );
      this.currentUser.set(user);
    } catch {
      this.currentUser.set(null);
    }
  }
}

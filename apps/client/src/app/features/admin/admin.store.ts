import { Injectable, inject, signal } from '@angular/core';
import type { AppSettingsDto, UpdateAppSettingsDto } from '@spothub/shared';
import { firstValueFrom } from 'rxjs';

import { AdminApi } from './admin.api';

/**
 * Signal-backed state for the Admin page: who may sign in.
 *
 * Every change is saved at once and the page shows what the API answered, so
 * what is on screen is always what the next sign-in will be judged by.
 */
@Injectable({ providedIn: 'root' })
export class AdminStore {
  private readonly api = inject(AdminApi);

  private readonly current = signal<AppSettingsDto | null>(null);
  private readonly busy = signal(false);
  private readonly writing = signal(false);
  private readonly failure = signal<string | null>(null);

  readonly settings = this.current.asReadonly();
  readonly loading = this.busy.asReadonly();
  readonly saving = this.writing.asReadonly();
  readonly error = this.failure.asReadonly();

  async load(): Promise<void> {
    this.busy.set(true);
    this.failure.set(null);

    try {
      this.current.set(await firstValueFrom(this.api.settings()));
    } catch {
      this.failure.set('Could not load the settings.');
    } finally {
      this.busy.set(false);
    }
  }

  setOpenRegistration(open: boolean): Promise<boolean> {
    return this.save({ openRegistration: open });
  }

  /** Adds an address to the list. One already on it is not added twice. */
  addEmail(email: string): Promise<boolean> {
    const address = email.trim().toLowerCase();
    const list = this.current()?.allowedEmails ?? [];

    if (list.includes(address)) {
      return Promise.resolve(true);
    }

    return this.save({ allowedEmails: [...list, address] });
  }

  removeEmail(email: string): Promise<boolean> {
    const list = this.current()?.allowedEmails ?? [];
    return this.save({ allowedEmails: list.filter((entry) => entry !== email) });
  }

  /** True once saved. A failure leaves the settings as they were on screen. */
  private async save(change: UpdateAppSettingsDto): Promise<boolean> {
    this.writing.set(true);

    try {
      this.current.set(await firstValueFrom(this.api.updateSettings(change)));
      return true;
    } catch {
      return false;
    } finally {
      this.writing.set(false);
    }
  }
}

import { Injectable, inject, signal } from '@angular/core';
import type { StorageUsageDto } from '@spothub/shared';
import { firstValueFrom } from 'rxjs';

import { apiMessage } from '../../core/api/api-error';
import { AccountApi } from './account.api';

/** The signed-in pilot's own account: how much room they use, and leaving. */
@Injectable({ providedIn: 'root' })
export class AccountStore {
  private readonly api = inject(AccountApi);

  private readonly usage = signal<StorageUsageDto | null>(null);
  private readonly busy = signal(false);
  private readonly failure = signal<string | null>(null);

  readonly storage = this.usage.asReadonly();
  readonly deleting = this.busy.asReadonly();
  readonly error = this.failure.asReadonly();

  async load(): Promise<void> {
    try {
      this.usage.set(await firstValueFrom(this.api.storage()));
    } catch {
      // The page still offers everything else; the usage just stays unknown.
      this.usage.set(null);
    }
  }

  /** True once the account is gone. On failure, says why — "the only admin", say. */
  async deleteAccount(): Promise<boolean> {
    this.busy.set(true);
    this.failure.set(null);

    try {
      await firstValueFrom(this.api.deleteAccount());
      this.usage.set(null);
      return true;
    } catch (error) {
      this.failure.set(
        apiMessage(error, 'Your account could not be deleted. Try again.'),
      );
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}

import { Injectable, inject, signal } from '@angular/core';
import type { Currency, PilotNameDto, StorageUsageDto } from '@spothub/shared';
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

  private readonly naming = signal(false);
  private readonly nameFailure = signal<string | null>(null);

  readonly storage = this.usage.asReadonly();
  readonly deleting = this.busy.asReadonly();
  readonly error = this.failure.asReadonly();
  readonly savingName = this.naming.asReadonly();
  readonly nameError = this.nameFailure.asReadonly();

  private readonly currencyFailure = signal<string | null>(null);
  readonly currencyError = this.currencyFailure.asReadonly();

  /** The saved currency on success; null on failure, with the reason in `currencyError`. */
  async setHomeCurrency(homeCurrency: Currency): Promise<Currency | null> {
    this.currencyFailure.set(null);

    try {
      const saved = await firstValueFrom(this.api.setHomeCurrency({ homeCurrency }));
      return saved.homeCurrency;
    } catch (error) {
      this.currencyFailure.set(
        apiMessage(error, 'Your home currency could not be saved. Try again.'),
      );
      return null;
    }
  }

  /** The saved name on success; null on failure, with the reason in `nameError`. */
  async setPilotName(pilotName: string | null): Promise<PilotNameDto | null> {
    this.naming.set(true);
    this.nameFailure.set(null);

    try {
      return await firstValueFrom(this.api.setPilotName({ pilotName }));
    } catch (error) {
      this.nameFailure.set(apiMessage(error, 'Your pilot name could not be saved. Try again.'));
      return null;
    } finally {
      this.naming.set(false);
    }
  }

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

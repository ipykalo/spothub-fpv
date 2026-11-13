import { Injectable, inject, signal } from '@angular/core';
import {
  ALLOWED_IMAGE_MIME,
  type Currency,
  type PilotNameDto,
  type PilotPhotoDto,
  type StorageUsageDto,
} from '@spothub/shared';
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

  private readonly photographing = signal(false);
  private readonly photoFailure = signal<string | null>(null);
  readonly savingPhoto = this.photographing.asReadonly();
  readonly photoError = this.photoFailure.asReadonly();

  /**
   * Uploads a new profile photo: a ticket, the bytes straight to storage, then
   * commit. The new address on success; null with the reason in `photoError`.
   */
  async uploadPhoto(file: File): Promise<PilotPhotoDto | null> {
    if (!(ALLOWED_IMAGE_MIME as readonly string[]).includes(file.type)) {
      this.photoFailure.set('Choose a JPEG, PNG, WebP or AVIF image.');
      return null;
    }

    return this.photoCall(async () => {
      const ticket = await firstValueFrom(
        this.api.requestPhotoUpload({
          fileName: file.name,
          mime: file.type as (typeof ALLOWED_IMAGE_MIME)[number],
          sizeBytes: file.size,
        }),
      );
      await firstValueFrom(this.api.putPhoto(ticket, file));
      return firstValueFrom(this.api.commitPhoto(ticket.assetId));
    }, 'Your photo could not be saved. Try again.');
  }

  removePhoto(): Promise<PilotPhotoDto | null> {
    return this.photoCall(
      () => firstValueFrom(this.api.removePhoto()),
      'Your photo could not be removed. Try again.',
    );
  }

  private async photoCall(
    call: () => Promise<PilotPhotoDto>,
    fallback: string,
  ): Promise<PilotPhotoDto | null> {
    this.photographing.set(true);
    this.photoFailure.set(null);

    try {
      const saved = await call();
      // A new photo changes what the storage meter says.
      void this.load();
      return saved;
    } catch (error) {
      this.photoFailure.set(apiMessage(error, fallback));
      return null;
    } finally {
      this.photographing.set(false);
    }
  }

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
      this.nameFailure.set(
        apiMessage(error, 'Your pilot name could not be saved. Try again.'),
      );
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

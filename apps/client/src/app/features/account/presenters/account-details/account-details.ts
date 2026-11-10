import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import type { CurrentUserDto, StorageUsageDto } from '@spothub/shared';

import { formatBytes, percentUsed } from '../../../../core/format/bytes';

/** What has to be typed before the delete button wakes up. */
const CONFIRMATION = 'DELETE';

/**
 * Presenter: who the pilot is, how much of their storage they use, and the
 * way out. Deleting asks for the word typed first — one click is too easy to
 * make by accident for something that cannot be undone.
 */
@Component({
  selector: 'sh-account-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  templateUrl: './account-details.html',
  styleUrl: './account-details.scss',
})
export class AccountDetails {
  readonly user = input.required<CurrentUserDto>();
  readonly storage = input<StorageUsageDto | null>(null);
  readonly deleting = input(false);
  readonly error = input<string | null>(null);

  readonly deleteConfirmed = output();

  protected readonly confirmation = CONFIRMATION;
  protected readonly typed = signal('');
  protected readonly confirmed = computed(() => this.typed().trim() === CONFIRMATION);

  protected readonly used = computed(() => {
    const storage = this.storage();

    return storage === null
      ? null
      : {
          text: `${formatBytes(storage.usedBytes)} of ${formatBytes(storage.limitBytes)}`,
          percent: percentUsed(storage.usedBytes, storage.limitBytes),
          full: storage.usedBytes >= storage.limitBytes,
        };
  });

  protected onTyped(event: Event): void {
    this.typed.set((event.target as HTMLInputElement).value);
  }

  protected confirm(): void {
    if (this.confirmed() && !this.deleting()) {
      this.deleteConfirmed.emit();
    }
  }
}

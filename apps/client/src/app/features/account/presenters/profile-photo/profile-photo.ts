import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ALLOWED_IMAGE_MIME } from '@spothub/shared';

import { Avatar } from '../../../../core/components/avatar/avatar';

/**
 * Presenter: the pilot's profile photo — what others see beside their name —
 * with a way to choose a new one or take it away. Removing needs no
 * confirmation: a new one is a click away.
 */
@Component({
  selector: 'sh-profile-photo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Avatar, MatButtonModule, MatIconModule],
  templateUrl: './profile-photo.html',
  styleUrl: './profile-photo.scss',
})
export class ProfilePhoto {
  readonly name = input<string | null>(null);
  readonly photoUrl = input<string | null>(null);
  readonly saving = input(false);
  readonly error = input<string | null>(null);

  readonly chosen = output<File>();
  readonly removed = output();

  protected readonly accept = ALLOWED_IMAGE_MIME.join(',');

  protected pick(event: Event): void {
    const field = event.target as HTMLInputElement;
    const file = field.files?.[0];
    // Cleared, so choosing the same file again still reports a change.
    field.value = '';

    if (file) {
      this.chosen.emit(file);
    }
  }
}

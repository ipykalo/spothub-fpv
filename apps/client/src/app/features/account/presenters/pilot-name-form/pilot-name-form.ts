import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import type { CurrentUserDto } from '@spothub/shared';

import { readPilotNameDraft } from './pilot-name-draft';

/**
 * Presenter: the name a pilot goes by on the site. Says what others will see
 * as it is typed, and that the full Google name stays private.
 */
@Component({
  selector: 'sh-pilot-name-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatFormFieldModule, MatInputModule],
  templateUrl: './pilot-name-form.html',
  styleUrl: './pilot-name-form.scss',
})
export class PilotNameForm {
  readonly user = input.required<CurrentUserDto>();
  readonly saving = input(false);
  readonly error = input<string | null>(null);

  /** The name to save, or null to go back to the short form. */
  readonly save = output<string | null>();

  protected readonly typed = signal('');
  protected readonly draft = computed(() =>
    readPilotNameDraft(this.typed(), this.user().displayName),
  );
  /** Nothing to save while the field says what is already saved. */
  protected readonly unchanged = computed(
    () => this.draft().value === (this.user().pilotName ?? null),
  );

  constructor() {
    // Starts from, and follows, what is saved.
    effect(() => { this.typed.set(this.user().pilotName ?? ''); });
  }

  protected onTyped(event: Event): void {
    this.typed.set((event.target as HTMLInputElement).value);
  }

  protected submit(): void {
    if (!this.draft().error && !this.unchanged() && !this.saving()) {
      this.save.emit(this.draft().value);
    }
  }
}

import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { type AppSettingsDto, allowedEmailSchema } from '@spothub/shared';

/**
 * Presenter: who may sign in — the open-sign-up switch, and the list that
 * decides while it is off. Announces each change; saving is the container's.
 * The address being typed is view state, so it lives here.
 */
@Component({
  selector: 'sh-sign-up-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSlideToggleModule,
  ],
  templateUrl: './sign-up-settings.html',
  styleUrl: './sign-up-settings.scss',
})
export class SignUpSettings {
  readonly settings = input.required<AppSettingsDto>();
  readonly saving = input(false);

  readonly openChanged = output<boolean>();
  readonly emailAdded = output<string>();
  readonly emailRemoved = output<string>();

  protected readonly draft = signal('');
  protected readonly error = signal<string | null>(null);

  protected onDraft(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
    this.error.set(null);
  }

  protected add(): void {
    // The same rule the API checks, so the two cannot disagree.
    const parsed = allowedEmailSchema.safeParse(this.draft());

    if (!parsed.success) {
      this.error.set(parsed.error.issues[0].message);
      return;
    }

    this.emailAdded.emit(parsed.data);
    this.draft.set('');
  }
}

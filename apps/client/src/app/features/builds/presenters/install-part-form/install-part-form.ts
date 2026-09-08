import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  INSTALL_REASON_LABELS,
  InstallReason,
  PART_CATEGORY_LABELS,
  installPartSchema,
  type InstallPartDto,
  type PartDto,
} from '@spothub/shared';

/** Presenter: fit a part to this build. Validates, then hands the value up. */
@Component({
  selector: 'sh-install-part-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './install-part-form.html',
  styleUrl: './install-part-form.scss',
})
export class InstallPartForm {
  readonly parts = input.required<readonly PartDto[]>();
  readonly saving = input(false);

  readonly installed = output<InstallPartDto>();

  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly reasons = Object.values(InstallReason);
  protected readonly reasonLabels = INSTALL_REASON_LABELS;
  protected readonly categoryLabels = PART_CATEGORY_LABELS;

  protected error: string | null = null;

  protected readonly form = this.fb.group({
    partId: [''],
    position: [''],
    // Defaults to today, which is when a part is fitted in almost every case.
    installedOn: [new Date().toISOString().slice(0, 10)],
    reason: [InstallReason.Initial as InstallReason],
  });

  protected label(part: PartDto): string {
    const named = [part.manufacturer, part.model].filter(Boolean).join(' ');
    return named || PART_CATEGORY_LABELS[part.category];
  }

  protected submit(): void {
    this.error = null;

    const raw = this.form.getRawValue();
    const parsed = installPartSchema.safeParse({
      partId: raw.partId,
      position: raw.position || null,
      installedOn: raw.installedOn,
      reason: raw.reason,
    });

    if (!parsed.success) {
      this.form.markAllAsTouched();
      this.error = parsed.error.issues[0]?.message ?? 'Check the fields';
      return;
    }

    this.installed.emit(parsed.data);

    // Keep the date and reason: fitting several parts in one sitting is the
    // normal case, and retyping the same date each time is friction.
    this.form.patchValue({ partId: '', position: '' });
  }
}

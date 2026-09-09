import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  REPAIR_CAUSE_LABELS,
  RepairCause,
  createRepairSchema,
  type CreateRepairDto,
} from '@spothub/shared';

/** Presenter: log a repair. Validates, then hands the value up. */
@Component({
  selector: 'sh-repair-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './repair-form.html',
  styleUrl: './repair-form.scss',
})
export class RepairForm {
  readonly saving = input(false);

  readonly logged = output<CreateRepairDto>();

  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly causes = Object.values(RepairCause);
  protected readonly causeLabels = REPAIR_CAUSE_LABELS;

  protected error: string | null = null;

  protected readonly form = this.fb.group({
    // Defaults to today: things are usually logged the evening they break.
    occurredOn: [new Date().toISOString().slice(0, 10)],
    cause: [RepairCause.Crash as RepairCause],
    descriptionMd: [''],
    cost: [null as number | null],
    currency: ['EUR'],
  });

  protected submit(): void {
    this.error = null;

    const raw = this.form.getRawValue();
    const parsed = createRepairSchema.safeParse({
      occurredOn: raw.occurredOn,
      cause: raw.cause,
      descriptionMd: raw.descriptionMd || null,
      cost: raw.cost,
      currency: raw.currency || null,
    });

    if (!parsed.success) {
      this.form.markAllAsTouched();
      this.error = parsed.error.issues[0]?.message ?? 'Check the fields';
      return;
    }

    this.logged.emit(parsed.data);

    // Keep the date and currency: logging two things from one session is
    // normal, and retyping them each time is friction.
    this.form.patchValue({ descriptionMd: '', cost: null });
  }
}

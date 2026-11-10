import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import {
  DEFAULT_HOME_CURRENCY,
  REPAIR_CAUSE_LABELS,
  RepairCause,
  createRepairSchema,
  type CreateRepairDto,
} from '@spothub/shared';

import { DateField } from '../../../../core/components/date-field/date-field';
import { localToday } from '../../../../core/components/date-field/iso-date';
import { Autocomplete } from '../../../../core/components/autocomplete/autocomplete';
import { CURRENCY_OPTIONS } from '../../../../core/components/currency-options';
import { REPAIR_CAUSE_STYLES } from '../../repair-cause';

/** Presenter: log a repair. Validates, then hands the value up. */
@Component({
  selector: 'sh-repair-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DateField,
    Autocomplete,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  templateUrl: './repair-form.html',
  styleUrl: './repair-form.scss',
})
export class RepairForm {
  readonly saving = input(false);
  /** What the cost field starts on: the pilot's home currency. */
  readonly defaultCurrency = input<string>(DEFAULT_HOME_CURRENCY);

  readonly logged = output<CreateRepairDto>();

  protected readonly currencyOptions = CURRENCY_OPTIONS;

  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly causeOptions = Object.values(RepairCause).map((cause) => ({
    value: cause,
    label: REPAIR_CAUSE_LABELS[cause],
    icon: REPAIR_CAUSE_STYLES[cause].icon,
  }));

  protected error: string | null = null;

  protected readonly form = this.fb.group({
    // Defaults to today: things are usually logged the evening they break.
    occurredOn: [localToday()],
    cause: [RepairCause.Crash as RepairCause],
    descriptionMd: [''],
    cost: [null as number | null],
    currency: [DEFAULT_HOME_CURRENCY as string],
  });

  constructor() {
    // Starts on, and follows, the pilot's own currency.
    effect(() => {
      this.form.controls.currency.setValue(this.defaultCurrency());
    });
  }

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

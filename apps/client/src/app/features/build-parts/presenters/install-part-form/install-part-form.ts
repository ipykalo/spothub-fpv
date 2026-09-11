import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

import {
  INSTALL_REASON_LABELS,
  InstallReason,
  PART_CATEGORY_LABELS,
  installPartSchema,
  REPAIR_CAUSE_LABELS,
  type InstallPartDto,
  type RepairDto,
} from '@spothub/shared';

import { Autocomplete } from '../../../../core/components/autocomplete/autocomplete';
import {
  type ChoiceOption,
  choicesFrom,
} from '../../../../core/components/choice-option';
import { PART_CATEGORY_ICONS } from '../../../parts/part-category';
import type { FittableUnit } from '../../../parts/part-condition';

/** Presenter: fit a part to this build. Validates, then hands the value up. */
@Component({
  selector: 'sh-install-part-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Autocomplete,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  templateUrl: './install-part-form.html',
  styleUrl: './install-part-form.scss',
})
export class InstallPartForm {
  /** Individual units, not kinds: you fit one motor, not "a motor". */
  readonly units = input.required<readonly FittableUnit[]>();
  /** Logged repairs, so a replacement can name the crash that caused it. */
  readonly repairs = input<readonly RepairDto[]>([]);
  readonly saving = input(false);

  readonly installed = output<InstallPartDto>();

  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly reasonOptions = choicesFrom(
    Object.values(InstallReason),
    INSTALL_REASON_LABELS,
  );

  /** Typing "motor" or "t-motor 2306" narrows to what is on the shelf. */
  protected readonly unitOptions = computed<readonly ChoiceOption<string>[]>(() =>
    this.units().map((unit) => ({
      value: unit.unitId,
      label: unit.label,
      icon: PART_CATEGORY_ICONS[unit.part.category],
      hint: PART_CATEGORY_LABELS[unit.part.category],
    })),
  );

  protected readonly repairOptions = computed<readonly ChoiceOption<string>[]>(() =>
    this.repairs().map((repair) => ({
      value: repair.id,
      label: `${repair.occurredOn} · ${REPAIR_CAUSE_LABELS[repair.cause]}`,
      ...(repair.descriptionMd ? { hint: repair.descriptionMd } : {}),
    })),
  );

  protected error: string | null = null;

  private readonly selectedReason = signal<InstallReason>(InstallReason.Initial);

  /**
   * The repair picker only appears for a replacement.
   *
   * That is the one case where "which crash caused this" has an answer, and
   * showing it always would put a sixth control on the row for nothing.
   */
  protected readonly showRepairPicker = computed(
    () =>
      this.selectedReason() === InstallReason.Replacement && this.repairs().length > 0,
  );

  protected readonly form = this.fb.group({
    unitId: [null as string | null],
    position: [''],
    // Defaults to today, which is when a part is fitted in almost every case.
    installedOn: [new Date().toISOString().slice(0, 10)],
    reason: [InstallReason.Initial as InstallReason],
    repairId: [null as string | null],
  });

  constructor() {
    this.form.controls.reason.valueChanges.subscribe((reason) => {
      this.selectedReason.set(reason);

      // A repair only explains a replacement; clear a stale link rather than
      // quietly attaching an upgrade to last month's crash.
      if (reason !== InstallReason.Replacement) {
        this.form.controls.repairId.setValue(null);
      }
    });
  }

  protected submit(): void {
    this.error = null;

    const raw = this.form.getRawValue();
    const parsed = installPartSchema.safeParse({
      unitId: raw.unitId ?? '',
      position: raw.position || null,
      installedOn: raw.installedOn,
      reason: raw.reason,
      repairId: raw.repairId,
    });

    if (!parsed.success) {
      this.form.markAllAsTouched();
      this.error = parsed.error.issues[0]?.message ?? 'Check the fields';
      return;
    }

    this.installed.emit(parsed.data);

    // Keep the date and reason: fitting several parts in one sitting is the
    // normal case, and retyping the same date each time is friction.
    // Keep the repair too: a crash that took an arm usually took props with it.
    this.form.patchValue({ unitId: null, position: '' });
  }
}

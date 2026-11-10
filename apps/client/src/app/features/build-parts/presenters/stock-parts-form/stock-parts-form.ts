import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  type FormControl,
  type FormGroup,
  ReactiveFormsModule,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import {
  PART_CATEGORY_LABELS,
  PartCategory,
  addStockPartsSchema,
  type AddStockPartsDto,
} from '@spothub/shared';

import { DateField } from '../../../../core/components/date-field/date-field';
import { localToday } from '../../../../core/components/date-field/iso-date';
import { Autocomplete } from '../../../../core/components/autocomplete/autocomplete';
import { choicesFrom } from '../../../../core/components/choice-option';
import { PART_CATEGORY_ICONS } from '../../../parts/part-category';

/** What a ready-made quad's spec sheet usually lists, so most rows need only a name typed. */
const USUAL_LINES: readonly { category: PartCategory; count: number }[] = [
  { category: PartCategory.Frame, count: 1 },
  { category: PartCategory.Fc, count: 1 },
  { category: PartCategory.Motor, count: 4 },
  { category: PartCategory.Prop, count: 4 },
  { category: PartCategory.Camera, count: 1 },
  { category: PartCategory.Vtx, count: 1 },
  { category: PartCategory.Antenna, count: 1 },
  { category: PartCategory.Rx, count: 1 },
];

/** One row of the form: a kind of part, its maker and model, and how many. */
type StockLine = FormGroup<{
  category: FormControl<PartCategory>;
  manufacturer: FormControl<string>;
  model: FormControl<string>;
  count: FormControl<number>;
}>;

/**
 * Presenter: the parts a ready-made quad came with, entered in one go. Starts
 * from the usual spec sheet; rows can be added or dropped. Each row becomes a
 * part on the shelf with `count` units, all fitted as what the quad came with
 * — no prices, since the quad's own price covers them.
 */
@Component({
  selector: 'sh-stock-parts-form',
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
  templateUrl: './stock-parts-form.html',
  styleUrl: './stock-parts-form.scss',
})
export class StockPartsForm {
  /** When the quad arrived — the build's own date, if it has one. */
  readonly receivedOn = input<string | null>(null);
  readonly saving = input(false);

  readonly saved = output<AddStockPartsDto>();
  readonly cancelled = output();

  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly categoryOptions = choicesFrom(
    Object.values(PartCategory),
    PART_CATEGORY_LABELS,
    PART_CATEGORY_ICONS,
  );

  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.group({
    installedOn: [localToday()],
    parts: this.fb.array(USUAL_LINES.map((line) => this.line(line.category, line.count))),
  });

  protected readonly lines = this.form.controls.parts;

  constructor() {
    effect(() => {
      const date = this.receivedOn();

      if (date) {
        this.form.controls.installedOn.setValue(date);
      }
    });
  }

  protected add(): void {
    this.lines.push(this.line(PartCategory.Other, 1));
  }

  protected drop(index: number): void {
    this.lines.removeAt(index);
  }

  protected submit(): void {
    this.error.set(null);

    const parsed = addStockPartsSchema.safeParse(this.form.getRawValue());

    if (!parsed.success) {
      // A failed parse always carries at least one issue.
      const [issue] = parsed.error.issues;
      const index = issue.path[1];
      const row = typeof index === 'number' ? `Row ${String(index + 1)}: ` : '';
      this.error.set(`${row}${issue.message}`);
      return;
    }

    this.saved.emit(parsed.data);
  }

  private line(category: PartCategory, count: number): StockLine {
    return this.fb.group({
      category: [category],
      manufacturer: [''],
      model: [''],
      count: [count],
    });
  }
}

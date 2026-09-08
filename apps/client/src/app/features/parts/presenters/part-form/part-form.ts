import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  type FormArray,
  FormBuilder,
  type FormControl,
  type FormGroup,
  ReactiveFormsModule,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import {
  PART_CATEGORY_LABELS,
  PART_STATUS_LABELS,
  PartCategory,
  PartStatus,
  createPartSchema,
  createPartSourceSchema,
  type CreatePartDto,
  type CreatePartSourceDto,
  type PartDto,
  type PartSourceDto,
  type UrlPreviewDto,
} from '@spothub/shared';

/** What the form hands back: the part, plus an optional first source row. */
export interface PartSubmission {
  readonly part: CreatePartDto;
  readonly source: CreatePartSourceDto | null;
}

/** One open key/value attribute row in the specification editor. */
type SpecRowGroup = FormGroup<{
  key: FormControl<string>;
  value: FormControl<string>;
}>;

interface RawSource {
  vendor: string;
  url: string;
  price: number | null;
  currency: string;
  isPurchase: boolean;
  purchasedOn: string;
}

/**
 * The spec keys worth prompting for per category.
 *
 * Only a starting point — the JSONB column is deliberately open, and any row
 * can be renamed or removed. Without these the field is a blank map and nobody
 * remembers that a motor is described by kv and stator size.
 */
const SPEC_SUGGESTIONS: Readonly<Record<PartCategory, readonly string[]>> = {
  [PartCategory.Frame]: ['wheelbase_mm', 'arm_thickness_mm', 'material'],
  [PartCategory.Motor]: ['kv', 'stator_size', 'shaft_mm'],
  [PartCategory.Esc]: ['current_a', 'protocol'],
  [PartCategory.Fc]: ['mcu', 'gyro', 'mounting_mm'],
  [PartCategory.Stack]: ['mcu', 'current_a', 'mounting_mm'],
  [PartCategory.Vtx]: ['power_mw', 'bands', 'connector'],
  [PartCategory.Camera]: ['sensor', 'aspect_ratio', 'lens_mm'],
  [PartCategory.Rx]: ['protocol', 'antenna'],
  [PartCategory.Antenna]: ['polarisation', 'connector', 'frequency_ghz'],
  [PartCategory.Prop]: ['size_inch', 'pitch', 'blades'],
  [PartCategory.Battery]: ['capacity_mah', 'cells', 'c_rating', 'connector'],
  [PartCategory.Other]: [],
};

/**
 * Presenter: owns the form and its validation, nothing else. It never saves and
 * never fetches — the pasted link is handed up as an intent, and the preview
 * comes back down as an input.
 */
@Component({
  selector: 'sh-part-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: './part-form.html',
  styleUrl: './part-form.scss',
})
export class PartForm {
  readonly part = input<PartDto | null>(null);
  readonly isEdit = input(false);
  readonly saving = input(false);
  readonly errorMessage = input<string | null>(null);
  readonly previewLoading = input(false);
  readonly preview = input<UrlPreviewDto | null>(null);

  readonly saved = output<PartSubmission>();
  readonly cancelled = output();
  readonly enrichRequested = output<string>();
  readonly sourceRemoved = output<PartSourceDto>();

  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly categories = Object.values(PartCategory);
  protected readonly statuses = Object.values(PartStatus);
  protected readonly categoryLabels = PART_CATEGORY_LABELS;
  protected readonly statusLabels = PART_STATUS_LABELS;

  private readonly validationError = signal<string | null>(null);
  private readonly selectedCategory = signal<PartCategory>(PartCategory.Motor);
  private readonly specKeys = signal<readonly string[]>([]);

  /** Whatever the container reported wins; local validation fills the gap. */
  protected readonly message = computed(
    () => this.errorMessage() ?? this.validationError(),
  );

  /** Keys the current category suggests that the form does not already have. */
  protected readonly suggestions = computed(() => {
    const present = new Set(this.specKeys());
    return SPEC_SUGGESTIONS[this.selectedCategory()].filter((key) => !present.has(key));
  });

  protected readonly form = this.fb.group({
    category: [PartCategory.Motor as PartCategory],
    manufacturer: [''],
    model: [''],
    quantityOwned: [1],
    status: [PartStatus.InUse as PartStatus],
    notesMd: [''],
    spec: this.fb.array([this.specRow('', '')]),
    source: this.fb.group({
      vendor: [''],
      url: [''],
      price: [null as number | null],
      currency: ['EUR'],
      isPurchase: [true],
      purchasedOn: [''],
    }),
  });

  protected get specRows(): FormArray<SpecRowGroup> {
    return this.form.controls.spec;
  }

  constructor() {
    this.specRows.clear();
    this.syncSpecKeys();

    this.form.controls.category.valueChanges.subscribe((category) => {
      this.selectedCategory.set(category);
    });

    effect(() => {
      const part = this.part();

      if (!part) {
        return;
      }

      this.form.patchValue({
        category: part.category,
        manufacturer: part.manufacturer ?? '',
        model: part.model ?? '',
        quantityOwned: part.quantityOwned,
        status: part.status,
        notesMd: part.notesMd ?? '',
      });

      this.selectedCategory.set(part.category);
      this.specRows.clear();

      for (const [key, value] of Object.entries(part.spec)) {
        this.specRows.push(this.specRow(key, String(value)));
      }

      this.syncSpecKeys();
    });

    // A preview never overwrites something already typed: enrichment is a
    // convenience, and a manual override must always survive it.
    effect(() => {
      const preview = this.preview();

      if (!preview) {
        return;
      }

      const current = this.form.getRawValue();
      const source = this.form.controls.source;

      if (preview.title && !current.model) {
        this.form.controls.model.setValue(preview.title.slice(0, 120));
      }

      if (preview.vendor && !current.source.vendor) {
        source.controls.vendor.setValue(preview.vendor);
      }

      if (preview.price !== null && current.source.price === null) {
        source.controls.price.setValue(preview.price);
      }

      if (preview.currency && !current.source.currency) {
        source.controls.currency.setValue(preview.currency);
      }
    });
  }

  protected addSpecRow(key = ''): void {
    this.specRows.push(this.specRow(key, ''));
    this.syncSpecKeys();
  }

  protected removeSpecRow(index: number): void {
    this.specRows.removeAt(index);
    this.syncSpecKeys();
  }

  protected onSpecKeyChange(): void {
    this.syncSpecKeys();
  }

  protected lookUpUrl(): void {
    const url = this.form.controls.source.controls.url.value.trim();

    if (url) {
      this.enrichRequested.emit(url);
    }
  }

  protected submit(): void {
    this.validationError.set(null);

    const raw = this.form.getRawValue();

    const parsedPart = createPartSchema.safeParse({
      category: raw.category,
      manufacturer: raw.manufacturer || null,
      model: raw.model || null,
      spec: toSpec(raw.spec),
      quantityOwned: raw.quantityOwned,
      status: raw.status,
      notesMd: raw.notesMd || null,
    });

    if (!parsedPart.success) {
      this.form.markAllAsTouched();
      this.validationError.set(parsedPart.error.issues[0]?.message ?? 'Check the form');
      return;
    }

    const source = this.parseSource(raw.source);

    if (source === 'invalid') {
      return;
    }

    this.saved.emit({ part: parsedPart.data, source });
  }

  /**
   * A source row is only built when something was actually entered. An empty
   * block means "no purchase recorded yet", not a row of nulls.
   */
  private parseSource(raw: RawSource): CreatePartSourceDto | null | 'invalid' {
    const hasContent = Boolean(raw.vendor || raw.url || raw.price !== null);

    if (!hasContent) {
      return null;
    }

    const parsed = createPartSourceSchema.safeParse({
      vendor: raw.vendor || null,
      url: raw.url || null,
      price: raw.price,
      currency: raw.currency || null,
      isPurchase: raw.isPurchase,
      purchasedOn: raw.purchasedOn || null,
      quantity: 1,
    });

    if (!parsed.success) {
      this.validationError.set(parsed.error.issues[0]?.message ?? 'Check the purchase');
      return 'invalid';
    }

    return parsed.data;
  }

  private specRow(key: string, value: string): SpecRowGroup {
    return this.fb.group({ key: [key], value: [value] });
  }

  private syncSpecKeys(): void {
    this.specKeys.set(this.specRows.controls.map((row) => row.controls.key.value));
  }
}

/** Blank keys are dropped; a row with no name is a row the user abandoned. */
function toSpec(rows: { key: string; value: string }[]): Record<string, string> {
  const spec: Record<string, string> = {};

  for (const row of rows) {
    const key = row.key.trim();

    if (key) {
      spec[key] = row.value.trim();
    }
  }

  return spec;
}

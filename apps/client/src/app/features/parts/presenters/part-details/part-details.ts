import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import {
  PART_CATEGORY_LABELS,
  PART_CONDITION_LABELS,
  PartCondition,
  type PartDto,
  type PartUnitDto,
} from '@spothub/shared';

import { Autocomplete } from '../../../../core/components/autocomplete/autocomplete';
import { Section } from '../../../../core/components/section/section';
import { PART_CATEGORY_ICONS } from '../../part-category';
import {
  PART_CONDITION_STYLES,
  availableUnits,
  fittedCount,
  unitCount,
  unitName,
} from '../../part-condition';

interface SpecEntry {
  readonly key: string;
  readonly value: string;
}

/**
 * Presenter: the whole part, read-only.
 *
 * The card has to clamp a listing title to two lines and show four
 * attributes; this is where the untruncated version lives.
 */
@Component({
  selector: 'sh-part-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Autocomplete, MatButtonModule, MatCardModule, MatIconModule, Section],
  templateUrl: './part-details.html',
  styleUrl: './part-details.scss',
})
export class PartDetails {
  readonly part = input.required<PartDto>();

  readonly removingUnitId = input<string | null>(null);

  readonly unitConditionChanged = output<{
    unit: PartUnitDto;
    condition: PartCondition;
  }>();
  readonly unitRemoved = output<PartUnitDto>();
  readonly unitAdded = output();

  protected readonly categoryLabels = PART_CATEGORY_LABELS;
  protected readonly categoryIcons = PART_CATEGORY_ICONS;
  protected readonly conditionStyles = PART_CONDITION_STYLES;

  protected readonly conditionOptions = Object.values(PartCondition).map((condition) => ({
    value: condition,
    label: PART_CONDITION_LABELS[condition],
    icon: PART_CONDITION_STYLES[condition].icon,
  }));

  /** Units not currently on a quad. */
  protected readonly free = computed(() => availableUnits(this.part()));
  protected readonly total = computed(() => unitCount(this.part()));
  protected readonly fitted = computed(() => fittedCount(this.part()));

  protected name(unit: PartUnitDto): string {
    return unitName(this.part(), unit);
  }

  protected changeCondition(unit: PartUnitDto, condition: PartCondition | null): void {
    if (condition !== null && condition !== unit.condition) {
      this.unitConditionChanged.emit({ unit, condition });
    }
  }

  protected readonly specEntries = computed<readonly SpecEntry[]>(() =>
    Object.entries(this.part().spec).map(([key, value]) => ({
      key,
      value: String(value),
    })),
  );

  /** The purchase first: it is the row the cost rollups actually count. */
  protected readonly sources = computed(() =>
    [...this.part().sources].sort((a, b) => Number(b.isPurchase) - Number(a.isPurchase)),
  );
}

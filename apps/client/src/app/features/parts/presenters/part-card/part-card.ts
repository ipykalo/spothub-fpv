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
import { RouterLink } from '@angular/router';
import { PART_CATEGORY_LABELS, PART_STATUS_LABELS, type PartDto } from '@spothub/shared';

import { PART_STATUS_STYLES, availableUnits } from '../../part-status';

interface SpecEntry {
  readonly key: string;
  readonly value: string;
}

/** Two dense rows fit the card body; the rest are counted, not listed. */
const MAX_SPEC_SHOWN = 3;

/**
 * Presenter: renders one part and announces intent. It owns no state, injects
 * nothing, and never talks to the store.
 */
@Component({
  selector: 'sh-part-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatCardModule, MatIconModule, RouterLink],
  templateUrl: './part-card.html',
  styleUrl: './part-card.scss',
})
export class PartCard {
  readonly part = input.required<PartDto>();
  readonly deleting = input(false);

  readonly delete = output<PartDto>();

  protected readonly statusLabels = PART_STATUS_LABELS;

  protected readonly style = computed(() => PART_STATUS_STYLES[this.part().status]);

  /**
   * Manufacturer and model are both optional. Falling back to the category
   * keeps every card titled rather than leaving a blank line where a name
   * should be.
   */
  protected readonly title = computed(() => {
    const part = this.part();
    const named = [part.manufacturer, part.model].filter(Boolean).join(' ');

    return named || PART_CATEGORY_LABELS[part.category];
  });

  /**
   * Where the units are — the half of the old status field that the database
   * knows and the owner should never have been typing.
   *
   * One row can stand for several physical items, so a single word could
   * never be right: at two of four fitted, neither "in use" nor "spare" is
   * true. A count is.
   */
  protected readonly stock = computed(() => {
    const part = this.part();
    const free = availableUnits(part);

    if (part.fittedCount === 0) {
      return `${part.quantityOwned} in stock`;
    }

    const fitted = `${part.fittedCount} of ${part.quantityOwned} fitted`;

    return free === 0 ? fitted : `${fitted}, ${free} free`;
  });

  protected readonly stockDetail = computed(() => {
    const free = availableUnits(this.part());
    return free === 0 ? 'None free to fit' : `${free} free to fit`;
  });

  private readonly specEntries = computed<readonly SpecEntry[]>(() =>
    Object.entries(this.part().spec).map(([key, value]) => ({
      key,
      value: String(value),
    })),
  );

  protected readonly visibleSpec = computed(() =>
    this.specEntries().slice(0, MAX_SPEC_SHOWN),
  );

  protected readonly hiddenSpecCount = computed(() =>
    Math.max(0, this.specEntries().length - MAX_SPEC_SHOWN),
  );
}

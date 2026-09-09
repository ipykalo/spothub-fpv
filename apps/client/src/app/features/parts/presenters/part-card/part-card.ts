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
import {
  PART_CATEGORY_LABELS,
  PART_CONDITION_LABELS,
  type PartCondition,
  type PartDto,
} from '@spothub/shared';

import type { StatusStyle } from '../../../../core/ui/status-style';
import { PART_CATEGORY_ICONS } from '../../part-category';
import {
  PART_CONDITION_STYLES,
  availableUnits,
  conditionCounts,
  fittedCount,
  unitCount,
} from '../../part-condition';

interface SpecEntry {
  readonly key: string;
  readonly value: string;
}

/** A condition present among a part's units, with how many are in it. */
interface ConditionTally {
  readonly condition: PartCondition;
  readonly count: number;
  readonly label: string;
  readonly style: StatusStyle;
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

  /**
   * One chip per condition present among the units.
   *
   * A part no longer has *a* condition — four motors with one dead reads as
   * "3 serviceable · 1 broken", which is precisely what a single status field
   * could not say.
   */
  protected readonly tallies = computed<readonly ConditionTally[]>(() =>
    conditionCounts(this.part()).map(([condition, count]) => ({
      condition,
      count,
      label: PART_CONDITION_LABELS[condition],
      style: PART_CONDITION_STYLES[condition],
    })),
  );

  /** The card's stripe follows the most serious condition present. */
  protected readonly tone = computed(() => {
    const tallies = this.tallies();
    const worst =
      tallies.find((tally) => tally.style.tone === 'stop') ??
      tallies.find((tally) => tally.style.tone === 'ready') ??
      tallies.at(0);

    return worst?.style.tone ?? 'idle';
  });

  protected readonly categoryIcon = computed(
    () => PART_CATEGORY_ICONS[this.part().category],
  );

  /** The icon's accessible name — the glyph alone says nothing to a reader. */
  protected readonly categoryLabel = computed(
    () => PART_CATEGORY_LABELS[this.part().category],
  );

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
   * Where the units are — derived from the install rows rather than typed.
   * A count is the only honest answer when one part means several objects.
   */
  protected readonly stock = computed(() => {
    const part = this.part();
    const total = unitCount(part);
    const fitted = fittedCount(part);
    const free = availableUnits(part);

    if (fitted === 0) {
      return `${total} in stock`;
    }

    const summary = `${fitted} of ${total} fitted`;

    return free === 0 ? summary : `${summary}, ${free} free`;
  });

  /** Units held, used to decide whether the price needs an "each". */
  protected readonly unitTotal = computed(() => unitCount(this.part()));

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

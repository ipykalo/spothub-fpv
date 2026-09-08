import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { PART_CATEGORY_LABELS, PART_STATUS_LABELS, type PartDto } from '@spothub/shared';

interface SpecEntry {
  readonly key: string;
  readonly value: string;
}

/** Two rows of attributes fit the card; the rest are counted, not listed. */
const MAX_SPEC_SHOWN = 4;

/**
 * Presenter: renders one part and announces intent. It owns no state, injects
 * nothing, and never talks to the store.
 */
@Component({
  selector: 'sh-part-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatCardModule, RouterLink],
  templateUrl: './part-card.html',
  styleUrl: './part-card.scss',
})
export class PartCard {
  readonly part = input.required<PartDto>();
  readonly deleting = input(false);

  readonly delete = output<PartDto>();

  protected readonly statusLabels = PART_STATUS_LABELS;

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

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { PART_CATEGORY_LABELS, PART_STATUS_LABELS, type PartDto } from '@spothub/shared';

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
  imports: [MatCardModule, MatIconModule],
  templateUrl: './part-details.html',
  styleUrl: './part-details.scss',
})
export class PartDetails {
  readonly part = input.required<PartDto>();

  protected readonly categoryLabels = PART_CATEGORY_LABELS;
  protected readonly statusLabels = PART_STATUS_LABELS;

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

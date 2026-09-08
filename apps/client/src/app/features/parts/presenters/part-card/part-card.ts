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
import { PART_STATUS_LABELS, type PartDto } from '@spothub/shared';

interface SpecEntry {
  readonly key: string;
  readonly value: string;
}

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

  /** Manufacturer and model are both optional; fall back to the category. */
  protected readonly title = computed(() => {
    const part = this.part();
    const name = [part.manufacturer, part.model].filter(Boolean).join(' ');

    return name || 'Unnamed part';
  });

  protected readonly specEntries = computed<readonly SpecEntry[]>(() =>
    Object.entries(this.part().spec).map(([key, value]) => ({
      key,
      value: String(value),
    })),
  );
}

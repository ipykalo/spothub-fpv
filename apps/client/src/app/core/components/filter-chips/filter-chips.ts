import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { type MatChipListboxChange, MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';

import type { ChoiceOption } from '../choice-option';

/**
 * A single-choice chip row with an "All" chip first — the filter every grid
 * uses. Reports a choice and decides nothing: `null` means no filter.
 *
 * Replaces the build-status and part-category rows, which were the same
 * component written twice.
 */
@Component({
  selector: 'sh-filter-chips',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatChipsModule, MatIconModule],
  templateUrl: './filter-chips.html',
  styleUrl: './filter-chips.scss',
  host: { class: 'block' },
})
export class FilterChips<T> {
  readonly options = input.required<readonly ChoiceOption<T>[]>();
  readonly selected = model<T | null>(null);
  readonly allLabel = input('All');
  readonly ariaLabel = input.required<string>();

  protected onChange(event: MatChipListboxChange): void {
    // Clicking the chip that is already on deselects it, which reads as "All".
    this.selected.set((event.value as T | undefined) ?? null);
  }
}

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { PART_CATEGORY_LABELS, type PartCategory } from '@spothub/shared';

import { PART_CATEGORY_ICONS } from '../../part-category';

/** Presenter: the category chip row. Reports a choice, decides nothing. */
@Component({
  selector: 'sh-part-category-filter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatChipsModule, MatIconModule],
  templateUrl: './part-category-filter.html',
  styleUrl: './part-category-filter.scss',
})
export class PartCategoryFilter {
  readonly categories = input.required<readonly PartCategory[]>();
  readonly selected = input<PartCategory | null>(null);

  readonly selectedChange = output<PartCategory | null>();

  protected readonly categoryLabels = PART_CATEGORY_LABELS;
  protected readonly categoryIcons = PART_CATEGORY_ICONS;
}

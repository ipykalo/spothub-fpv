import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { PART_CATEGORY_LABELS, PartCategory, type PartDto } from '@spothub/shared';

import { choicesFrom } from '../../../core/components/choice-option';
import { FilterChips } from '../../../core/components/filter-chips/filter-chips';
import { GridToolbar } from '../../../core/components/grid-toolbar/grid-toolbar';
import {
  type GridSpec,
  GridState,
  type SortOption,
  gridView,
} from '../../../core/components/grid-toolbar/grid-view';
import { Section } from '../../../core/components/section/section';
import { PART_CATEGORY_ICONS } from '../part-category';
import { availableUnits, partName } from '../part-condition';
import { PartCard } from '../presenters/part-card/part-card';
import { PartsStore } from '../parts.store';
import { CollapseAll } from '../../../core/components/section/collapse-all';
import { SectionGroup } from '../../../core/components/section/section-group';

type PartSortKey = 'name' | 'price' | 'free' | 'added';

const PART_GRID: GridSpec<PartDto, PartSortKey> = {
  // The spec is searchable too, so "2306" or "1500mah" finds a part by what
  // it is rather than only by what it is called.
  text: (part) => [
    part.manufacturer,
    part.model,
    PART_CATEGORY_LABELS[part.category],
    ...Object.entries(part.spec).map(([key, value]) => `${key} ${String(value)}`),
    ...part.sources.map((source) => source.vendor),
  ],
  sortBy: {
    name: partName,
    price: (part) => part.purchasePrice,
    free: availableUnits,
    added: (part) => part.createdAt,
  },
};

const SORTS: readonly SortOption<PartSortKey>[] = [
  { key: 'name', label: 'Name' },
  { key: 'price', label: 'Price', direction: 'desc' },
  { key: 'free', label: 'Free', direction: 'desc' },
  { key: 'added', label: 'Added', direction: 'desc' },
];

/**
 * Container: owns the store, the side effects and the notifications. Every
 * card below the toolbar is rendered by a presenter.
 *
 * The category filter goes to the server; search and sort run on the page,
 * inside each category, so the groups keep their order.
 */
@Component({
  selector: 'sh-parts-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CollapseAll,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    RouterLink,
    FilterChips,
    GridToolbar,
    PartCard,
    Section,
  ],
  hostDirectives: [SectionGroup],
  templateUrl: './parts-list.page.html',
  styleUrl: './parts-list.page.scss',
})
export class PartsListPage {
  protected readonly store = inject(PartsStore);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly sorts = SORTS;
  protected readonly pendingDelete = signal<string | null>(null);

  protected readonly categoryOptions = choicesFrom(
    Object.values(PartCategory),
    PART_CATEGORY_LABELS,
    PART_CATEGORY_ICONS,
  );

  protected readonly grid = new GridState<PartSortKey>({ key: 'name', direction: 'asc' });

  /** Each category's cards, searched and sorted; a category left empty is dropped. */
  protected readonly groups = computed(() => {
    const query = this.grid.query();
    const sort = this.grid.sort();

    return this.store
      .groups()
      .map((group) => ({
        ...group,
        parts: gridView(group.parts, PART_GRID, query, sort),
      }))
      .filter((group) => group.parts.length > 0);
  });

  protected readonly shown = computed(() =>
    this.groups().reduce((sum, group) => sum + group.parts.length, 0),
  );

  /** Nothing in the inventory at all, as opposed to nothing matching a filter. */
  protected readonly firstRun = computed(
    () => this.store.isEmpty() && this.store.category() === null,
  );

  constructor() {
    void this.store.load();
  }

  protected onFilter(category: PartCategory | null): void {
    void this.store.load(category);
  }

  protected async remove(part: PartDto): Promise<void> {
    this.pendingDelete.set(part.id);

    try {
      await this.store.remove(part.id);
      this.snackBar.open('Part deleted', undefined, { duration: 3000 });
    } catch {
      this.snackBar.open('Could not delete that part', undefined, { duration: 4000 });
    } finally {
      this.pendingDelete.set(null);
    }
  }
}

import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

import type { GridSort, SortOption } from './grid-view';

/**
 * Search, filter and sort for any grid: the toolbar above every list.
 *
 * Owns no rows. It edits a `GridState` through two-way bindings and the host
 * applies it with `gridView()`, so the same toolbar serves a list of repairs
 * and a page of part cards. Filters are projected in — usually a
 * `sh-filter-chips` row — because what a grid filters by is its own business.
 */
@Component({
  selector: 'sh-grid-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  templateUrl: './grid-toolbar.html',
  styleUrl: './grid-toolbar.scss',
  host: { class: 'block' },
})
export class GridToolbar<K extends string> {
  readonly query = model('');
  readonly sort = model.required<GridSort<K>>();
  readonly sorts = input.required<readonly SortOption<K>[]>();
  /** Rows left after filtering, and before — shown as "3 of 7" when they differ. */
  readonly shown = input<number | null>(null);
  readonly total = input<number | null>(null);
  readonly searchLabel = input('Search');

  /** A second click on the active sort reverses it. */
  protected sortBy(option: SortOption<K>): void {
    const current = this.sort();

    this.sort.set(
      current.key === option.key
        ? { key: option.key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key: option.key, direction: option.direction ?? 'asc' },
    );
  }

  protected onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected clear(): void {
    this.query.set('');
  }
}

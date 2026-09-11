import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import {
  INSTALL_REASON_LABELS,
  PART_CATEGORY_LABELS,
  PartCategory,
  type BuildPartDto,
} from '@spothub/shared';

import { choicesFrom } from '../../../../core/components/choice-option';
import { FilterChips } from '../../../../core/components/filter-chips/filter-chips';
import { GridToolbar } from '../../../../core/components/grid-toolbar/grid-toolbar';
import {
  type GridSpec,
  GridState,
  type SortOption,
  gridView,
} from '../../../../core/components/grid-toolbar/grid-view';
import { PART_CATEGORY_ICONS } from '../../../parts/part-category';
import { unitName as partUnitName } from '../../../parts/part-condition';

type InstallSortKey = 'fitted' | 'removed' | 'name' | 'position';

/** Manufacturer and model are both optional; fall back to the category. */
function installName(install: BuildPartDto): string {
  const { manufacturer, model, category } = install.part;
  const named = [manufacturer, model].filter(Boolean).join(' ');

  return named || PART_CATEGORY_LABELS[category];
}

const INSTALL_GRID: GridSpec<BuildPartDto, InstallSortKey> = {
  text: (install) => [
    installName(install),
    install.position,
    PART_CATEGORY_LABELS[install.part.category],
    INSTALL_REASON_LABELS[install.reason],
    install.installedOn,
    install.removedOn,
  ],
  sortBy: {
    fitted: (install) => install.installedOn,
    removed: (install) => install.removedOn,
    name: installName,
    position: (install) => install.position,
  },
};

const SORTS: readonly SortOption<InstallSortKey>[] = [
  { key: 'fitted', label: 'Fitted', direction: 'desc' },
  { key: 'name', label: 'Name' },
  { key: 'position', label: 'Position' },
];

const HISTORY_SORTS: readonly SortOption<InstallSortKey>[] = [
  { key: 'removed', label: 'Removed', direction: 'desc' },
  ...SORTS,
];

/**
 * Presenter: the components on a build. Renders a list and announces intent —
 * it owns no state and never talks to a store. How the list is searched and
 * sorted is view state, held in its own `GridState`.
 */
@Component({
  selector: 'sh-installed-parts-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FilterChips, GridToolbar, MatButtonModule, MatIconModule, RouterLink],
  templateUrl: './installed-parts-list.html',
  styleUrl: './installed-parts-list.scss',
})
export class InstalledPartsList {
  readonly installs = input.required<readonly BuildPartDto[]>();
  /** Past installs render without a remove action and with their end date. */
  readonly history = input(false);
  readonly pendingRemoval = input<string | null>(null);

  readonly removeRequested = output<BuildPartDto>();

  protected readonly categoryLabels = PART_CATEGORY_LABELS;
  protected readonly categoryIcons = PART_CATEGORY_ICONS;
  protected readonly reasonLabels = INSTALL_REASON_LABELS;

  protected readonly grid = new GridState<InstallSortKey, PartCategory>({
    key: 'fitted',
    direction: 'desc',
  });

  protected readonly sorts = computed(() => (this.history() ? HISTORY_SORTS : SORTS));

  /** Only the categories actually on the build — a chip that empties the list is noise. */
  protected readonly categoryOptions = computed(() => {
    const present = new Set(this.installs().map((install) => install.part.category));

    return choicesFrom(
      Object.values(PartCategory).filter((category) => present.has(category)),
      PART_CATEGORY_LABELS,
      PART_CATEGORY_ICONS,
    );
  });

  protected readonly rows = computed(() => {
    const category = this.grid.filter();
    // A filter for a category no longer present would silently empty the list.
    const active = this.categoryOptions().some((option) => option.value === category)
      ? category
      : null;

    return gridView(
      this.installs(),
      INSTALL_GRID,
      this.grid.query(),
      this.grid.sort(),
      (install) => active === null || install.part.category === active,
    );
  });

  /** Which physical unit this was — "#3", or whatever is written on it. */
  protected unitName(install: BuildPartDto): string {
    return partUnitName(install.part, install.unit);
  }

  protected name(install: BuildPartDto): string {
    return installName(install);
  }
}

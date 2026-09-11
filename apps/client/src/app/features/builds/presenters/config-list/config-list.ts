import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CONFIG_KIND_LABELS, ConfigKind, type ConfigDto } from '@spothub/shared';

import { choicesFrom } from '../../../../core/components/choice-option';
import { FilterChips } from '../../../../core/components/filter-chips/filter-chips';
import { GridToolbar } from '../../../../core/components/grid-toolbar/grid-toolbar';
import {
  type GridSpec,
  GridState,
  type SortOption,
  gridView,
} from '../../../../core/components/grid-toolbar/grid-view';

type ConfigSortKey = 'captured' | 'firmware';

const CONFIG_GRID: GridSpec<ConfigDto, ConfigSortKey> = {
  text: (config) => [
    config.note,
    config.fwVersion,
    config.boardName,
    config.fwTarget,
    config.manufacturerId,
    CONFIG_KIND_LABELS[config.kind],
    config.capturedAt.slice(0, 10),
  ],
  sortBy: {
    captured: (config) => config.capturedAt,
    firmware: (config) => config.fwVersion,
  },
};

const SORTS: readonly SortOption<ConfigSortKey>[] = [
  { key: 'captured', label: 'Captured', direction: 'desc' },
  { key: 'firmware', label: 'Firmware', direction: 'desc' },
];

/**
 * Presenter: the firmware captures on a build, newest first.
 *
 * Renders a list and announces intent — it owns no state and never talks to a
 * store.
 */
@Component({
  selector: 'sh-config-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FilterChips, GridToolbar, MatButtonModule, MatIconModule],
  templateUrl: './config-list.html',
  styleUrl: './config-list.scss',
})
export class ConfigList {
  readonly configs = input.required<readonly ConfigDto[]>();
  readonly pendingRemoval = input<string | null>(null);

  readonly removeRequested = output<ConfigDto>();
  readonly copyRequested = output<ConfigDto>();
  readonly downloadRequested = output<ConfigDto>();

  /** The capture whose text is being fetched, so the row can say so. */
  readonly busyId = input<string | null>(null);
  /** Briefly set after a successful copy, as the only feedback that fits a row. */
  readonly copiedId = input<string | null>(null);

  protected readonly kindLabels = CONFIG_KIND_LABELS;
  protected readonly sorts = SORTS;

  protected readonly grid = new GridState<ConfigSortKey, ConfigKind>({
    key: 'captured',
    direction: 'desc',
  });

  protected readonly kindOptions = computed(() => {
    const present = new Set(this.configs().map((config) => config.kind));

    return choicesFrom(
      Object.values(ConfigKind).filter((kind) => present.has(kind)),
      CONFIG_KIND_LABELS,
    );
  });

  protected readonly rows = computed(() => {
    const kind = this.grid.filter();
    const active = this.kindOptions().some((option) => option.value === kind)
      ? kind
      : null;

    return gridView(
      this.configs(),
      CONFIG_GRID,
      this.grid.query(),
      this.grid.sort(),
      (config) => active === null || config.kind === active,
    );
  });

  /**
   * Captures whose firmware version differs from the one before them.
   *
   * Betaflight's own guidance is that settings do not carry across versions,
   * so a flash is the point where comparing configs stops being meaningful —
   * worth marking in the list. Worked out on the input order, newest first,
   * so re-sorting the view never moves the mark.
   */
  protected readonly flashedAt = computed(() => {
    const configs = this.configs();
    const marked = new Set<string>();

    for (let index = 0; index < configs.length - 1; index += 1) {
      const current = configs.at(index);
      const previous = configs.at(index + 1);

      if (
        current?.fwVersion &&
        previous?.fwVersion &&
        current.fwVersion !== previous.fwVersion
      ) {
        marked.add(current.id);
      }
    }

    return marked;
  });

  protected date(value: string): string {
    return value.slice(0, 10);
  }
}

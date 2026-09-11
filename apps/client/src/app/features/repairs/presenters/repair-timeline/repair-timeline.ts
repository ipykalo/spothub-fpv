import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { REPAIR_CAUSE_LABELS, RepairCause, type RepairDto } from '@spothub/shared';

import { FilterChips } from '../../../../core/components/filter-chips/filter-chips';
import { GridToolbar } from '../../../../core/components/grid-toolbar/grid-toolbar';
import {
  type GridSpec,
  GridState,
  type SortOption,
  gridView,
} from '../../../../core/components/grid-toolbar/grid-view';
import { REPAIR_CAUSE_STYLES } from '../../repair-cause';

type RepairSortKey = 'date' | 'cost' | 'cause';

const REPAIR_GRID: GridSpec<RepairDto, RepairSortKey> = {
  text: (repair) => [
    repair.descriptionMd,
    REPAIR_CAUSE_LABELS[repair.cause],
    repair.occurredOn,
    repair.currency,
  ],
  sortBy: {
    date: (repair) => repair.occurredOn,
    cost: (repair) => repair.cost,
    cause: (repair) => REPAIR_CAUSE_LABELS[repair.cause],
  },
};

const SORTS: readonly SortOption<RepairSortKey>[] = [
  { key: 'date', label: 'Date', direction: 'desc' },
  { key: 'cost', label: 'Cost', direction: 'desc' },
  { key: 'cause', label: 'Cause' },
];

/**
 * Presenter: what has gone wrong with this build, newest first. Renders a
 * list and announces intent — it owns no state and never talks to a store.
 */
@Component({
  selector: 'sh-repair-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FilterChips, GridToolbar, MatButtonModule, MatIconModule],
  templateUrl: './repair-timeline.html',
  styleUrl: './repair-timeline.scss',
})
export class RepairTimeline {
  readonly repairs = input.required<readonly RepairDto[]>();
  readonly pendingRemoval = input<string | null>(null);

  readonly removeRequested = output<RepairDto>();

  protected readonly causeLabels = REPAIR_CAUSE_LABELS;
  protected readonly causeStyles = REPAIR_CAUSE_STYLES;
  protected readonly sorts = SORTS;

  protected readonly grid = new GridState<RepairSortKey, RepairCause>({
    key: 'date',
    direction: 'desc',
  });

  /** Only the causes actually logged. */
  protected readonly causeOptions = computed(() => {
    const present = new Set(this.repairs().map((repair) => repair.cause));

    return Object.values(RepairCause)
      .filter((cause) => present.has(cause))
      .map((cause) => ({
        value: cause,
        label: REPAIR_CAUSE_LABELS[cause],
        icon: REPAIR_CAUSE_STYLES[cause].icon,
      }));
  });

  protected readonly rows = computed(() => {
    const cause = this.grid.filter();
    const active = this.causeOptions().some((option) => option.value === cause)
      ? cause
      : null;

    return gridView(
      this.repairs(),
      REPAIR_GRID,
      this.grid.query(),
      this.grid.sort(),
      (repair) => active === null || repair.cause === active,
    );
  });
}

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
import {
  BUILD_CLASS_LABELS,
  BUILD_STATUS_LABELS,
  BuildStatus,
  type BuildDto,
} from '@spothub/shared';

import type { ChoiceOption } from '../../../core/components/choice-option';
import { FilterChips } from '../../../core/components/filter-chips/filter-chips';
import { GridToolbar } from '../../../core/components/grid-toolbar/grid-toolbar';
import {
  type GridSpec,
  GridState,
  type SortOption,
  gridView,
} from '../../../core/components/grid-toolbar/grid-view';
import { BUILD_STATUS_STYLES } from '../build-status';
import { BuildCard } from '../presenters/build-card/build-card';
import { BuildsStore } from '../builds.store';

const STATUS_ORDER: readonly BuildStatus[] = [
  BuildStatus.Active,
  BuildStatus.Down,
  BuildStatus.Planning,
  BuildStatus.Retired,
];

type BuildSortKey = 'updated' | 'name' | 'status' | 'added';

const BUILD_GRID: GridSpec<BuildDto, BuildSortKey> = {
  text: (build) => [
    build.name,
    BUILD_STATUS_LABELS[build.status],
    build.buildClass ? BUILD_CLASS_LABELS[build.buildClass] : null,
    build.descriptionMd,
  ],
  sortBy: {
    updated: (build) => build.updatedAt,
    name: (build) => build.name,
    // Flying first, then grounded — the order the chips read in.
    status: (build) => STATUS_ORDER.indexOf(build.status),
    added: (build) => build.createdAt,
  },
};

const SORTS: readonly SortOption<BuildSortKey>[] = [
  { key: 'updated', label: 'Updated', direction: 'desc' },
  { key: 'name', label: 'Name' },
  { key: 'status', label: 'Status' },
  { key: 'added', label: 'Added', direction: 'desc' },
];

/**
 * Container: owns the store, the side effects and the notifications. Every
 * pixel below the toolbar is rendered by a presenter.
 *
 * The status filter goes to the server, as it always has; search and sort run
 * on the page over what came back.
 */
@Component({
  selector: 'sh-builds-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    RouterLink,
    BuildCard,
    FilterChips,
    GridToolbar,
  ],
  templateUrl: './builds-list.page.html',
  styleUrl: './builds-list.page.scss',
})
export class BuildsListPage {
  protected readonly store = inject(BuildsStore);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly sorts = SORTS;
  protected readonly pendingDelete = signal<string | null>(null);

  protected readonly statusOptions: readonly ChoiceOption<BuildStatus>[] =
    STATUS_ORDER.map((status) => ({
      value: status,
      label: BUILD_STATUS_LABELS[status],
      icon: BUILD_STATUS_STYLES[status].icon,
    }));

  protected readonly grid = new GridState<BuildSortKey>({
    key: 'updated',
    direction: 'desc',
  });

  protected readonly rows = computed(() =>
    gridView(this.store.builds(), BUILD_GRID, this.grid.query(), this.grid.sort()),
  );

  /** Nothing in the hangar at all, as opposed to nothing matching a filter. */
  protected readonly firstRun = computed(
    () => this.store.isEmpty() && this.store.status() === null,
  );

  constructor() {
    void this.store.load();
  }

  protected onFilter(status: BuildStatus | null): void {
    void this.store.load(status);
  }

  protected async remove(build: BuildDto): Promise<void> {
    this.pendingDelete.set(build.id);

    try {
      await this.store.remove(build.id);
      this.snackBar.open(`Deleted ${build.name}`, undefined, { duration: 3000 });
    } catch {
      this.snackBar.open('Could not delete that build', undefined, { duration: 4000 });
    } finally {
      this.pendingDelete.set(null);
    }
  }
}

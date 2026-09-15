import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  BUILD_CLASS_LABELS,
  BUILD_STATUS_LABELS,
  BuildStatus,
  CommentSubject,
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
import { CommentsStore } from '../../comments/comments.store';
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

/** Whose builds the page shows: the viewer's own, or ones other pilots shared. */
type BuildScope = 'mine' | 'shared';

const BUILD_GRID: GridSpec<BuildDto, BuildSortKey> = {
  text: (build) => [
    build.name,
    BUILD_STATUS_LABELS[build.status],
    build.buildClass ? BUILD_CLASS_LABELS[build.buildClass] : null,
    build.descriptionMd,
    build.ownedByViewer ? null : build.ownerName,
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
 * Shows the viewer's own builds, or, with `?scope=shared`, the ones other
 * pilots shared. The status filter goes to the server for either list, as it
 * always has; search and sort run on the page over what came back. The
 * viewer's own cards also say how many new questions wait on each.
 */
@Component({
  selector: 'sh-builds-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
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
  /** `?scope=shared`, so the shared list is a link that can be sent. Bound via `withComponentInputBinding`. */
  readonly scope = input<string | undefined>(undefined);

  protected readonly store = inject(BuildsStore);
  protected readonly comments = inject(CommentsStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly commentSubject = CommentSubject.Build;
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

  /** The query parameter, read as one of the two lists; anything unexpected is "mine". */
  protected readonly activeScope = computed<BuildScope>(() =>
    this.scope() === 'shared' ? 'shared' : 'mine',
  );
  protected readonly isShared = computed(() => this.activeScope() === 'shared');

  protected readonly list = computed(() =>
    this.isShared() ? this.store.shared() : this.store.builds(),
  );
  protected readonly loading = computed(() =>
    this.isShared() ? this.store.sharedLoading() : this.store.loading(),
  );
  protected readonly failure = computed(() =>
    this.isShared() ? this.store.sharedError() : this.store.error(),
  );

  protected readonly rows = computed(() =>
    gridView(this.list(), BUILD_GRID, this.grid.query(), this.grid.sort()),
  );

  /** Nothing in the chosen list at all, as opposed to nothing matching a filter. */
  protected readonly firstRun = computed(
    () => !this.loading() && this.list().length === 0 && this.store.status() === null,
  );

  constructor() {
    void this.comments.loadUnread();

    // Each list is loaded when it is opened, so switching back never shows a stale one.
    effect(() => {
      const shared = this.isShared();
      untracked(() => void (shared ? this.store.loadShared() : this.store.load()));
    });
  }

  protected async setScope(scope: BuildScope): Promise<void> {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { scope: scope === 'shared' ? 'shared' : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected onFilter(status: BuildStatus | null): void {
    void (this.isShared() ? this.store.loadShared(status) : this.store.load(status));
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

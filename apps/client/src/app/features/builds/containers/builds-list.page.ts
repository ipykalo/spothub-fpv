import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { BuildStatus, type BuildDto } from '@spothub/shared';

import { BuildCard } from '../presenters/build-card/build-card';
import { BuildStatusFilter } from '../presenters/build-status-filter/build-status-filter';
import { BuildsStore } from '../builds.store';

const STATUS_ORDER: readonly BuildStatus[] = [
  BuildStatus.Active,
  BuildStatus.Down,
  BuildStatus.Planning,
  BuildStatus.Retired,
];

/**
 * Container: owns the store, the side effects and the notifications. Every
 * pixel below the toolbar is rendered by a presenter.
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
    BuildStatusFilter,
  ],
  templateUrl: './builds-list.page.html',
  styleUrl: './builds-list.page.scss',
})
export class BuildsListPage {
  protected readonly store = inject(BuildsStore);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly statuses = STATUS_ORDER;
  protected readonly pendingDelete = signal<string | null>(null);

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

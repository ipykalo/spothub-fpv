import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  BUILD_CLASS_LABELS,
  BUILD_STATUS_LABELS,
  type BuildDto,
  type BuildPartDto,
  type InstallPartDto,
} from '@spothub/shared';

import { PartsStore } from '../../parts/parts.store';
import { BuildCostSummary } from '../presenters/build-cost-summary/build-cost-summary';
import { InstallPartForm } from '../presenters/install-part-form/install-part-form';
import { InstalledPartsList } from '../presenters/installed-parts-list/installed-parts-list';
import { BuildPartsStore } from '../build-parts.store';
import { BuildsApi } from '../builds.api';
import { BuildsStore } from '../builds.store';

/**
 * Container: the build page. Owns both stores and the side effects; every
 * region below the header is rendered by a presenter.
 */
@Component({
  selector: 'sh-build-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    RouterLink,
    BuildCostSummary,
    InstallPartForm,
    InstalledPartsList,
  ],
  templateUrl: './build-detail.page.html',
  styleUrl: './build-detail.page.scss',
})
export class BuildDetailPage {
  /** Route param. Bound via `withComponentInputBinding`. */
  readonly id = input.required<string>();

  protected readonly installs = inject(BuildPartsStore);
  protected readonly parts = inject(PartsStore);
  private readonly builds = inject(BuildsStore);
  private readonly api = inject(BuildsApi);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly build = signal<BuildDto | null>(null);
  protected readonly saving = signal(false);
  protected readonly pendingRemoval = signal<string | null>(null);
  protected readonly showHistory = signal(false);

  protected readonly statusLabels = BUILD_STATUS_LABELS;
  protected readonly classLabels = BUILD_CLASS_LABELS;

  constructor() {
    // Route inputs land after construction, so this cannot run in the ctor.
    effect(() => {
      const id = this.id();

      untracked(() => {
        void this.hydrate(id);
        void this.installs.load(id);

        // The install picker needs the inventory; harmless if already loaded.
        if (this.parts.parts().length === 0) {
          void this.parts.load();
        }
      });
    });
  }

  protected toggleHistory(): void {
    this.showHistory.update((shown) => !shown);
  }

  protected async install(input: InstallPartDto): Promise<void> {
    this.saving.set(true);

    try {
      await this.installs.install(this.id(), input);
      this.snackBar.open('Fitted', undefined, { duration: 2500 });
    } catch {
      this.snackBar.open('Could not fit that part', undefined, { duration: 4000 });
    } finally {
      this.saving.set(false);
    }
  }

  /** Removal records an end date; the row stays so the history survives. */
  protected async remove(install: BuildPartDto): Promise<void> {
    this.pendingRemoval.set(install.id);

    try {
      await this.installs.remove(this.id(), install.id, {
        removedOn: new Date().toISOString().slice(0, 10),
      });

      this.snackBar.open('Removed', undefined, { duration: 2500 });
    } catch {
      this.snackBar.open('Could not remove that part', undefined, { duration: 4000 });
    } finally {
      this.pendingRemoval.set(null);
    }
  }

  private async hydrate(id: string): Promise<void> {
    const cached = this.builds.find(id);

    if (cached) {
      this.build.set(cached);
      return;
    }

    try {
      this.build.set(await firstValueFrom(this.api.getOne(id)));
    } catch {
      this.build.set(null);
    }
  }
}

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
  type ConfigDto,
  type CreateConfigDto,
  type CreateRepairDto,
  type InstallPartDto,
  type RepairDto,
} from '@spothub/shared';

import { fittableUnits } from '../../parts/part-condition';
import { PartsStore } from '../../parts/parts.store';
import { BUILD_STATUS_STYLES } from '../build-status';
import { BuildCostSummary } from '../presenters/build-cost-summary/build-cost-summary';
import { InstallPartForm } from '../presenters/install-part-form/install-part-form';
import { InstalledPartsList } from '../presenters/installed-parts-list/installed-parts-list';
import { RepairForm } from '../presenters/repair-form/repair-form';
import { RepairTimeline } from '../presenters/repair-timeline/repair-timeline';
import { RepairsStore } from '../repairs.store';
import { ConfigList } from '../presenters/config-list/config-list';
import { ConfigPasteForm } from '../presenters/config-paste-form/config-paste-form';
import { ConfigsStore } from '../configs.store';
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
    RepairForm,
    RepairTimeline,
    ConfigList,
    ConfigPasteForm,
  ],
  templateUrl: './build-detail.page.html',
  styleUrl: './build-detail.page.scss',
})
export class BuildDetailPage {
  /** Route param. Bound via `withComponentInputBinding`. */
  readonly id = input.required<string>();

  protected readonly installs = inject(BuildPartsStore);
  protected readonly repairs = inject(RepairsStore);
  protected readonly configs = inject(ConfigsStore);
  protected readonly parts = inject(PartsStore);
  private readonly builds = inject(BuildsStore);
  private readonly api = inject(BuildsApi);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly build = signal<BuildDto | null>(null);
  protected readonly saving = signal(false);
  protected readonly pendingRemoval = signal<string | null>(null);
  protected readonly showHistory = signal(false);
  protected readonly loggingRepair = signal(false);
  protected readonly removingRepairId = signal<string | null>(null);
  protected readonly savingConfig = signal(false);
  protected readonly removingConfigId = signal<string | null>(null);

  /**
   * Every free, serviceable unit across the inventory. The picker chooses a
   * specific object, so fitting one of four motors leaves the other three
   * offered rather than hiding the whole row.
   */
  protected readonly fittable = computed(() => fittableUnits(this.parts.parts()));

  protected readonly statusLabels = BUILD_STATUS_LABELS;
  protected readonly classLabels = BUILD_CLASS_LABELS;

  /** Same icon and tone the card uses, so the two pages cannot disagree. */
  protected readonly statusStyle = computed(() => {
    const status = this.build()?.status;
    return status ? BUILD_STATUS_STYLES[status] : BUILD_STATUS_STYLES.PLANNING;
  });

  constructor() {
    // Route inputs land after construction, so this cannot run in the ctor.
    effect(() => {
      const id = this.id();

      untracked(() => {
        void this.hydrate(id);
        void this.installs.load(id);
        void this.repairs.load(id);
        void this.configs.load(id);

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

      // A linked install changes that repair's "parts replaced" count.
      if (input.repairId) {
        await this.repairs.load(this.id());
      }

      this.snackBar.open('Fitted', undefined, { duration: 2500 });
    } catch {
      this.snackBar.open('Could not fit that part', undefined, { duration: 4000 });
    } finally {
      this.saving.set(false);
    }
  }

  /** Removal records an end date; the row stays so the history survives. */
  protected async saveConfig(input: CreateConfigDto): Promise<void> {
    this.savingConfig.set(true);

    try {
      await this.configs.create(this.id(), input);
      this.snackBar.open('Capture saved', undefined, { duration: 2500 });
    } catch {
      this.snackBar.open('Could not save that capture', undefined, { duration: 4000 });
    } finally {
      this.savingConfig.set(false);
    }
  }

  protected async removeConfig(config: ConfigDto): Promise<void> {
    this.removingConfigId.set(config.id);

    try {
      await this.configs.remove(this.id(), config.id);
      this.snackBar.open('Deleted', undefined, { duration: 2500 });
    } catch {
      this.snackBar.open('Could not delete that capture', undefined, { duration: 4000 });
    } finally {
      this.removingConfigId.set(null);
    }
  }

  protected async logRepair(input: CreateRepairDto): Promise<void> {
    this.loggingRepair.set(true);

    try {
      await this.repairs.create(this.id(), input);
      // The rollup counts repair spend, so it changes when one is logged.
      await this.installs.load(this.id());
      this.snackBar.open('Logged', undefined, { duration: 2500 });
    } catch {
      this.snackBar.open('Could not log that repair', undefined, { duration: 4000 });
    } finally {
      this.loggingRepair.set(false);
    }
  }

  protected async removeRepair(repair: RepairDto): Promise<void> {
    this.removingRepairId.set(repair.id);

    try {
      await this.repairs.remove(this.id(), repair.id);
      await this.installs.load(this.id());
      this.snackBar.open('Deleted', undefined, { duration: 2500 });
    } catch {
      this.snackBar.open('Could not delete that repair', undefined, { duration: 4000 });
    } finally {
      this.removingRepairId.set(null);
    }
  }

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

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
import { DOCUMENT } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  BUILD_CLASS_LABELS,
  BUILD_STATUS_LABELS,
  VISIBILITY_LABELS,
  type BuildDto,
  type AssetDto,
  type BuildPartDto,
  type ConfigDto,
  type CreateConfigDto,
  type CreateRepairDto,
  configFileName,
  type InstallPartDto,
  type RepairDto,
} from '@spothub/shared';

import { Section } from '../../../core/components/section/section';
import { CollapseAll } from '../../../core/components/section/collapse-all';
import { SectionGroup } from '../../../core/components/section/section-group';
import { InstallPartForm } from '../../build-parts/presenters/install-part-form/install-part-form';
import { InstalledPartsList } from '../../build-parts/presenters/installed-parts-list/installed-parts-list';
import { BuildPartsStore } from '../../build-parts/build-parts.store';
import { ConfigList } from '../../configs/presenters/config-list/config-list';
import { ConfigPasteForm } from '../../configs/presenters/config-paste-form/config-paste-form';
import { ConfigsApi } from '../../configs/configs.api';
import { ConfigsStore } from '../../configs/configs.store';
import { PhotoGallery } from '../../photos/presenters/photo-gallery/photo-gallery';
import { PhotosStore } from '../../photos/photos.store';
import { fittableUnits } from '../../parts/part-condition';
import { PartsStore } from '../../parts/parts.store';
import { RepairForm } from '../../repairs/presenters/repair-form/repair-form';
import { RepairTimeline } from '../../repairs/presenters/repair-timeline/repair-timeline';
import { RepairsStore } from '../../repairs/repairs.store';
import { BUILD_STATUS_STYLES } from '../build-status';
import { BuildCostSummary } from '../presenters/build-cost-summary/build-cost-summary';
import { BuildsApi } from '../builds.api';
import { BuildsStore } from '../builds.store';

/**
 * Container: the build page. Owns the stores and the side effects; every
 * region below the header is a collapsible section rendered by a presenter.
 *
 * Which forms are open is decided here too. Every "add" form stays closed
 * until asked for, so the page shows what the build *is* before it shows how
 * to change it.
 */
@Component({
  selector: 'sh-build-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CollapseAll,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    RouterLink,
    Section,
    BuildCostSummary,
    InstallPartForm,
    PhotoGallery,
    InstalledPartsList,
    RepairForm,
    RepairTimeline,
    ConfigList,
    ConfigPasteForm,
  ],
  hostDirectives: [SectionGroup],
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
  protected readonly photos = inject(PhotosStore);
  private readonly builds = inject(BuildsStore);
  private readonly api = inject(BuildsApi);
  private readonly configsApi = inject(ConfigsApi);
  private readonly document = inject(DOCUMENT);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly build = signal<BuildDto | null>(null);
  protected readonly saving = signal(false);
  protected readonly pendingRemoval = signal<string | null>(null);
  protected readonly loggingRepair = signal(false);
  protected readonly removingRepairId = signal<string | null>(null);
  protected readonly savingConfig = signal(false);
  protected readonly removingConfigId = signal<string | null>(null);
  protected readonly fetchingConfigId = signal<string | null>(null);
  protected readonly copiedConfigId = signal<string | null>(null);

  /** Which "add" form is open, one flag per section. */
  protected readonly addingPhotos = signal(false);
  protected readonly addingFit = signal(false);
  protected readonly addingRepair = signal(false);
  protected readonly addingConfig = signal(false);

  /**
   * Every free, serviceable unit across the inventory. The picker chooses a
   * specific object, so fitting one of four motors leaves the other three
   * offered rather than hiding the whole row.
   */
  protected readonly fittable = computed(() => fittableUnits(this.parts.parts()));

  protected readonly statusLabels = BUILD_STATUS_LABELS;
  protected readonly classLabels = BUILD_CLASS_LABELS;
  protected readonly visibilityLabels = VISIBILITY_LABELS;

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
        void this.photos.load(id);

        // The install picker needs the inventory; harmless if already loaded.
        if (this.parts.parts().length === 0) {
          void this.parts.load();
        }
      });
    });
  }

  protected async uploadPhotos(files: readonly File[]): Promise<void> {
    await this.photos.upload(this.id(), files);

    const failed = this.photos.error();

    if (failed) {
      this.snackBar.open(failed, undefined, { duration: 4000 });
    } else {
      // Done adding: fold the drop zone away and let the photos have the room.
      this.addingPhotos.set(false);
    }
  }

  protected async removePhoto(photo: AssetDto): Promise<void> {
    const wasCover = this.build()?.coverAssetId === photo.id;

    try {
      await this.photos.remove(this.id(), photo.id);

      // `builds.cover_asset_id` is SET NULL, so the build lost its cover on the
      // server and the header has to stop showing one.
      if (wasCover) {
        await this.hydrate(this.id(), true);
      }

      this.snackBar.open('Photo removed', undefined, { duration: 2500 });
    } catch {
      this.snackBar.open('Could not remove that photo', undefined, { duration: 4000 });
    }
  }

  protected async setCover(photo: AssetDto): Promise<void> {
    try {
      await this.photos.setCover(this.id(), photo.id);
      // Re-read so the header, and the card in the list, show the new cover.
      await this.hydrate(this.id(), true);
      this.snackBar.open('Cover updated', undefined, { duration: 2500 });
    } catch {
      this.snackBar.open('Could not set that cover', undefined, { duration: 4000 });
    }
  }

  protected async reorderPhotos(assetIds: readonly string[]): Promise<void> {
    try {
      await this.photos.reorder(this.id(), assetIds);
    } catch {
      this.snackBar.open('Could not save that order', undefined, { duration: 4000 });
    }
  }

  /**
   * The fit form stays open after a success, unlike the others: fitting
   * several parts in one sitting is the normal case.
   */
  protected async install(input: InstallPartDto): Promise<void> {
    this.saving.set(true);

    try {
      await this.installs.install(this.id(), input);

      // The picker offers units where `fitted` is false, and that flag lives on
      // the parts list rather than on the install. Without this the unit just
      // fitted stays in the dropdown until something else reloads the
      // inventory — which used to mean navigating to Parts and back.
      await this.parts.load();

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

  protected async saveConfig(input: CreateConfigDto): Promise<void> {
    this.savingConfig.set(true);

    try {
      await this.configs.create(this.id(), input);
      this.addingConfig.set(false);
      this.snackBar.open('Capture saved', undefined, { duration: 2500 });
    } catch {
      this.snackBar.open('Could not save that capture', undefined, { duration: 4000 });
    } finally {
      this.savingConfig.set(false);
    }
  }

  /**
   * Copy is the real restore path.
   *
   * Betaflight restores by pasting CLI text into its CLI tab, so the clipboard
   * matters more than the file. The text is not held in the list, so it is
   * fetched on demand.
   */
  protected async copyConfig(config: ConfigDto): Promise<void> {
    this.fetchingConfigId.set(config.id);

    try {
      const full = await firstValueFrom(this.configsApi.getOne(this.id(), config.id));
      await navigator.clipboard.writeText(full.raw);

      this.copiedConfigId.set(config.id);
      globalThis.setTimeout(() => {
        this.copiedConfigId.set(null);
      }, 2000);
    } catch {
      this.snackBar.open('Could not copy that capture', undefined, { duration: 4000 });
    } finally {
      this.fetchingConfigId.set(null);
    }
  }

  /** Saves a `.txt` named the way Betaflight Configurator names its backups. */
  protected async downloadConfig(config: ConfigDto): Promise<void> {
    this.fetchingConfigId.set(config.id);

    try {
      const full = await firstValueFrom(this.configsApi.getOne(this.id(), config.id));
      const name = configFileName(full, new Date(full.capturedAt));
      const blob = new Blob([full.raw], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const link = this.document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();

      // The blob stays in memory until this is called.
      URL.revokeObjectURL(url);
    } catch {
      this.snackBar.open('Could not save that capture', undefined, { duration: 4000 });
    } finally {
      this.fetchingConfigId.set(null);
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
      this.addingRepair.set(false);
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

  /** Removal records an end date; the row stays so the history survives. */
  protected async remove(install: BuildPartDto): Promise<void> {
    this.pendingRemoval.set(install.id);

    try {
      await this.installs.remove(this.id(), install.id, {
        removedOn: new Date().toISOString().slice(0, 10),
      });

      // The same staleness in reverse: the unit is free again and has to come
      // back into the picker.
      await this.parts.load();

      this.snackBar.open('Removed', undefined, { duration: 2500 });
    } catch {
      this.snackBar.open('Could not remove that part', undefined, { duration: 4000 });
    } finally {
      this.pendingRemoval.set(null);
    }
  }

  private async hydrate(id: string, force = false): Promise<void> {
    if (!force) {
      const cached = this.builds.find(id);

      if (cached) {
        this.build.set(cached);
        return;
      }
    }

    try {
      // Through the store when forced, so the cached card is refreshed too.
      this.build.set(
        force ? await this.builds.refresh(id) : await firstValueFrom(this.api.getOne(id)),
      );
    } catch {
      if (!force) {
        this.build.set(null);
      }
    }
  }
}

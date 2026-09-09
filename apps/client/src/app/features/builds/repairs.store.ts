import { Injectable, computed, inject, signal } from '@angular/core';
import type { CreateRepairDto, LinkInstallDto, RepairDto } from '@spothub/shared';
import { firstValueFrom } from 'rxjs';

import { RepairsApi } from './repairs.api';

/**
 * Signal-backed state for one build's crash log.
 *
 * Components read signals and call intents; none of them touch HttpClient
 * directly, so the loading and error handling exist in exactly one place.
 */
@Injectable({ providedIn: 'root' })
export class RepairsStore {
  private readonly api = inject(RepairsApi);

  private readonly items = signal<readonly RepairDto[]>([]);
  private readonly busy = signal(false);
  private readonly failure = signal<string | null>(null);

  readonly repairs = this.items.asReadonly();
  readonly loading = this.busy.asReadonly();
  readonly error = this.failure.asReadonly();

  readonly isEmpty = computed(() => !this.busy() && this.items().length === 0);

  async load(buildId: string): Promise<void> {
    this.busy.set(true);
    this.failure.set(null);

    try {
      this.items.set(await firstValueFrom(this.api.list(buildId)));
    } catch {
      this.failure.set('Could not load the repair log.');
    } finally {
      this.busy.set(false);
    }
  }

  async create(buildId: string, input: CreateRepairDto): Promise<void> {
    const created = await firstValueFrom(this.api.create(buildId, input));

    // Newest first, matching the order the server returns.
    this.items.update((repairs) => [created, ...repairs]);
  }

  async remove(buildId: string, repairId: string): Promise<void> {
    const snapshot = this.items();

    // Optimistic: the entry disappears immediately and is restored if the
    // call fails, so a delete feels instant on a slow connection.
    this.items.update((repairs) => repairs.filter((repair) => repair.id !== repairId));

    try {
      await firstValueFrom(this.api.remove(buildId, repairId));
    } catch (error) {
      this.items.set(snapshot);
      throw error;
    }
  }

  /** Linking changes a repair's install count, so re-read the list. */
  async linkInstall(
    buildId: string,
    installId: string,
    input: LinkInstallDto,
  ): Promise<void> {
    await firstValueFrom(this.api.linkInstall(buildId, installId, input));
    await this.load(buildId);
  }

  reset(): void {
    this.items.set([]);
    this.failure.set(null);
  }
}

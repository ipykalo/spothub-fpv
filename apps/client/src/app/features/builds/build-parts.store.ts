import { Injectable, computed, inject, signal } from '@angular/core';
import type {
  BuildCostDto,
  BuildPartDto,
  InstallPartDto,
  RemoveInstallDto,
} from '@spothub/shared';
import { firstValueFrom } from 'rxjs';

import { BuildPartsApi } from './build-parts.api';

const EMPTY_COST: BuildCostDto = { totals: [], unpricedCount: 0, installedCount: 0 };

/**
 * Signal-backed state for what is fitted to one build.
 *
 * Holds the whole history and derives the fitted set from it, so removing a
 * part moves it between two lists on screen without another round trip.
 */
@Injectable({ providedIn: 'root' })
export class BuildPartsStore {
  private readonly api = inject(BuildPartsApi);

  private readonly items = signal<readonly BuildPartDto[]>([]);
  private readonly busy = signal(false);
  private readonly failure = signal<string | null>(null);
  private readonly rollup = signal<BuildCostDto>(EMPTY_COST);
  private readonly currentBuildId = signal<string | null>(null);

  readonly installs = this.items.asReadonly();
  readonly loading = this.busy.asReadonly();
  readonly error = this.failure.asReadonly();
  readonly cost = this.rollup.asReadonly();

  /** `removedOn === null` is what "currently fitted" means. */
  readonly fitted = computed(() =>
    this.items().filter((install) => install.removedOn === null),
  );

  readonly removed = computed(() =>
    this.items().filter((install) => install.removedOn !== null),
  );

  readonly isEmpty = computed(() => !this.busy() && this.items().length === 0);

  async load(buildId: string): Promise<void> {
    this.currentBuildId.set(buildId);
    this.busy.set(true);
    this.failure.set(null);

    try {
      const [installs, cost] = await Promise.all([
        firstValueFrom(this.api.list(buildId)),
        firstValueFrom(this.api.cost(buildId)),
      ]);

      this.items.set(installs);
      this.rollup.set(cost);
    } catch {
      this.failure.set('Could not load the components on this build.');
    } finally {
      this.busy.set(false);
    }
  }

  async install(buildId: string, input: InstallPartDto): Promise<void> {
    const created = await firstValueFrom(this.api.install(buildId, input));
    this.items.update((installs) => [created, ...installs]);
    await this.refreshCost(buildId);
  }

  async remove(
    buildId: string,
    installId: string,
    input: RemoveInstallDto,
  ): Promise<void> {
    const closed = await firstValueFrom(this.api.remove(buildId, installId, input));

    this.items.update((installs) =>
      installs.map((install) => (install.id === closed.id ? closed : install)),
    );

    await this.refreshCost(buildId);
  }

  reset(): void {
    this.items.set([]);
    this.rollup.set(EMPTY_COST);
    this.currentBuildId.set(null);
    this.failure.set(null);
  }

  /** Fitting or removing changes what the rollup counts, so re-read it. */
  private async refreshCost(buildId: string): Promise<void> {
    try {
      this.rollup.set(await firstValueFrom(this.api.cost(buildId)));
    } catch {
      // The list is already correct; a stale total is better than an error.
    }
  }
}

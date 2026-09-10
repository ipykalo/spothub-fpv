import { Injectable, computed, inject, signal } from '@angular/core';
import type {
  BuildDto,
  BuildStatus,
  CreateBuildDto,
  UpdateBuildDto,
} from '@spothub/shared';
import { firstValueFrom } from 'rxjs';

import { BuildsApi } from './builds.api';

/**
 * Signal-backed state for the hangar.
 *
 * Components read signals and call intents; none of them touch HttpClient
 * directly, so the loading and error handling exist in exactly one place.
 */
@Injectable({ providedIn: 'root' })
export class BuildsStore {
  private readonly api = inject(BuildsApi);

  private readonly items = signal<readonly BuildDto[]>([]);
  private readonly busy = signal(false);
  private readonly failure = signal<string | null>(null);
  private readonly statusFilter = signal<BuildStatus | null>(null);

  readonly builds = this.items.asReadonly();
  readonly loading = this.busy.asReadonly();
  readonly error = this.failure.asReadonly();
  readonly status = this.statusFilter.asReadonly();

  readonly isEmpty = computed(() => !this.busy() && this.items().length === 0);
  readonly total = computed(() => this.items().length);

  async load(status: BuildStatus | null = this.statusFilter()): Promise<void> {
    this.statusFilter.set(status);
    this.busy.set(true);
    this.failure.set(null);

    try {
      const builds = await firstValueFrom(this.api.list(status ? { status } : {}));
      this.items.set(builds);
    } catch {
      this.failure.set('Could not load your builds.');
    } finally {
      this.busy.set(false);
    }
  }

  async create(input: CreateBuildDto): Promise<BuildDto> {
    const created = await firstValueFrom(this.api.create(input));
    this.items.update((builds) => [created, ...builds]);

    return created;
  }

  async update(id: string, input: UpdateBuildDto): Promise<BuildDto> {
    const updated = await firstValueFrom(this.api.update(id, input));
    this.items.update((builds) =>
      builds.map((build) => (build.id === id ? updated : build)),
    );

    return updated;
  }

  async remove(id: string): Promise<void> {
    const snapshot = this.items();

    // Optimistic: the row disappears immediately and is restored if the call
    // fails, so a delete feels instant on a slow connection.
    this.items.update((builds) => builds.filter((build) => build.id !== id));

    try {
      await firstValueFrom(this.api.remove(id));
    } catch (error) {
      this.items.set(snapshot);
      throw error;
    }
  }

  /**
   * Re-reads one build and replaces it in the cached list.
   *
   * Needed when something outside the build form changes it — setting a cover
   * photo writes `cover_asset_id` through the photos route, and the card on
   * the list page would otherwise keep the previous image.
   */
  async refresh(id: string): Promise<BuildDto> {
    const build = await firstValueFrom(this.api.getOne(id));

    this.items.update((builds) =>
      builds.some((existing) => existing.id === id)
        ? builds.map((existing) => (existing.id === id ? build : existing))
        : builds,
    );

    return build;
  }

  find(id: string): BuildDto | undefined {
    return this.items().find((build) => build.id === id);
  }
}

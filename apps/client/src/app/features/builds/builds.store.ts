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
 * Signal-backed state for the hangar: the viewer's own builds, and the ones
 * other pilots shared. Kept as two lists, because only the first is ever
 * written to.
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

  private readonly sharedItems = signal<readonly BuildDto[]>([]);
  private readonly sharedBusy = signal(false);
  private readonly sharedFailure = signal<string | null>(null);

  readonly builds = this.items.asReadonly();
  readonly loading = this.busy.asReadonly();
  readonly error = this.failure.asReadonly();
  /** One status filter, applied to whichever list is open. */
  readonly status = this.statusFilter.asReadonly();

  readonly shared = this.sharedItems.asReadonly();
  readonly sharedLoading = this.sharedBusy.asReadonly();
  readonly sharedError = this.sharedFailure.asReadonly();

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

  async loadShared(status: BuildStatus | null = this.statusFilter()): Promise<void> {
    this.statusFilter.set(status);
    this.sharedBusy.set(true);
    this.sharedFailure.set(null);

    try {
      const builds = await firstValueFrom(this.api.listShared(status ? { status } : {}));
      this.sharedItems.set(builds);
    } catch {
      this.sharedFailure.set('Could not load the builds other pilots shared.');
    } finally {
      this.sharedBusy.set(false);
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
   * Re-reads one build and replaces it in whichever cached list holds it.
   *
   * Needed when something outside the build form changes it — setting a cover
   * photo writes `cover_asset_id` through the photos route, and the card on
   * the list page would otherwise keep the previous image.
   */
  async refresh(id: string): Promise<BuildDto> {
    const build = await firstValueFrom(this.api.getOne(id));
    const replace = (builds: readonly BuildDto[]): readonly BuildDto[] =>
      builds.some((existing) => existing.id === id)
        ? builds.map((existing) => (existing.id === id ? build : existing))
        : builds;

    this.items.update(replace);
    this.sharedItems.update(replace);

    return build;
  }

  /** A build already loaded into either list, so opening it needs no request. */
  find(id: string): BuildDto | undefined {
    return (
      this.items().find((build) => build.id === id) ??
      this.sharedItems().find((build) => build.id === id)
    );
  }
}

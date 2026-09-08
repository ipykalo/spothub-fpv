import { Injectable, computed, inject, signal } from '@angular/core';
import {
  PART_CATEGORY_LABELS,
  type CreatePartDto,
  type CreatePartSourceDto,
  type PartCategory,
  type PartDto,
  type PartStatus,
  type UpdatePartDto,
  type UpdatePartSourceDto,
} from '@spothub/shared';
import { firstValueFrom } from 'rxjs';

import { PartsApi } from './parts.api';
import { isFittable } from './part-status';

/** A category heading plus the parts under it, ready for the template. */
export interface PartGroup {
  readonly category: PartCategory;
  readonly label: string;
  readonly parts: readonly PartDto[];
}

/**
 * Signal-backed state for the parts inventory.
 *
 * Components read signals and call intents; none of them touch HttpClient
 * directly, so the loading and error handling exist in exactly one place.
 */
@Injectable({ providedIn: 'root' })
export class PartsStore {
  private readonly api = inject(PartsApi);

  private readonly items = signal<readonly PartDto[]>([]);
  private readonly busy = signal(false);
  private readonly failure = signal<string | null>(null);
  private readonly categoryFilter = signal<PartCategory | null>(null);
  private readonly statusFilter = signal<PartStatus | null>(null);

  readonly parts = this.items.asReadonly();
  readonly loading = this.busy.asReadonly();
  readonly error = this.failure.asReadonly();
  readonly category = this.categoryFilter.asReadonly();
  readonly status = this.statusFilter.asReadonly();

  readonly isEmpty = computed(() => !this.busy() && this.items().length === 0);

  /**
   * Parts that can still be fitted to a build.
   *
   * A broken or retired part must never be offered, and a part is only
   * available while fewer units are on a quad than are owned — one row can
   * stand for four motors, and fitting one must not hide the other three.
   */
  readonly fittable = computed(() => this.items().filter(isFittable));
  readonly total = computed(() => this.items().length);

  /** Total units held, which is what "how many props do I have" really asks. */
  readonly unitCount = computed(() =>
    this.items().reduce((sum, part) => sum + part.quantityOwned, 0),
  );

  /**
   * The list grouped by category, in the order the API returned them. Derived
   * here rather than in the component so the grouping is testable on its own.
   */
  readonly groups = computed<readonly PartGroup[]>(() => {
    const byCategory = new Map<PartCategory, PartDto[]>();

    for (const part of this.items()) {
      const existing = byCategory.get(part.category);

      if (existing) {
        existing.push(part);
      } else {
        byCategory.set(part.category, [part]);
      }
    }

    return [...byCategory.entries()].map(([category, parts]) => ({
      category,
      label: PART_CATEGORY_LABELS[category],
      parts,
    }));
  });

  async load(
    category: PartCategory | null = this.categoryFilter(),
    status: PartStatus | null = this.statusFilter(),
  ): Promise<void> {
    this.categoryFilter.set(category);
    this.statusFilter.set(status);
    this.busy.set(true);
    this.failure.set(null);

    try {
      const parts = await firstValueFrom(
        this.api.list({
          ...(category ? { category } : {}),
          ...(status ? { status } : {}),
        }),
      );

      this.items.set(parts);
    } catch {
      this.failure.set('Could not load your parts.');
    } finally {
      this.busy.set(false);
    }
  }

  async create(input: CreatePartDto): Promise<PartDto> {
    const created = await firstValueFrom(this.api.create(input));
    this.items.update((parts) => [created, ...parts]);

    return created;
  }

  async update(id: string, input: UpdatePartDto): Promise<PartDto> {
    const updated = await firstValueFrom(this.api.update(id, input));
    this.replace(updated);

    return updated;
  }

  async remove(id: string): Promise<void> {
    const snapshot = this.items();

    // Optimistic: the row disappears immediately and is restored if the call
    // fails, so a delete feels instant on a slow connection.
    this.items.update((parts) => parts.filter((part) => part.id !== id));

    try {
      await firstValueFrom(this.api.remove(id));
    } catch (error) {
      this.items.set(snapshot);
      throw error;
    }
  }

  /** Adding a source changes the part's rolled-up price, so re-read the part. */
  async addSource(partId: string, input: CreatePartSourceDto): Promise<void> {
    await firstValueFrom(this.api.addSource(partId, input));
    const refreshed = await firstValueFrom(this.api.getOne(partId));
    this.replace(refreshed);
  }

  /** Correcting a recorded purchase changes the rollup, so re-read the part. */
  async updateSource(
    partId: string,
    sourceId: string,
    input: UpdatePartSourceDto,
  ): Promise<void> {
    await firstValueFrom(this.api.updateSource(partId, sourceId, input));
    const refreshed = await firstValueFrom(this.api.getOne(partId));
    this.replace(refreshed);
  }

  async removeSource(partId: string, sourceId: string): Promise<void> {
    await firstValueFrom(this.api.removeSource(partId, sourceId));
    const refreshed = await firstValueFrom(this.api.getOne(partId));
    this.replace(refreshed);
  }

  find(id: string): PartDto | undefined {
    return this.items().find((part) => part.id === id);
  }

  private replace(part: PartDto): void {
    this.items.update((parts) =>
      parts.map((existing) => (existing.id === part.id ? part : existing)),
    );
  }
}

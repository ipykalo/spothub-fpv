import { Injectable, computed, inject, signal } from '@angular/core';
import {
  PART_CATEGORY_LABELS,
  type CreatePartDto,
  type CreatePartSourceDto,
  type PartCategory,
  type PartDto,
  type CreatePartUnitDto,
  type PartCondition,
  type UpdatePartUnitDto,
  type UpdatePartDto,
  type UpdatePartSourceDto,
} from '@spothub/shared';
import { firstValueFrom } from 'rxjs';

import { PartsApi } from './parts.api';
import { PART_CATEGORY_ICONS } from './part-category';
import { fittedCount, isFittable, unitCount } from './part-condition';

/** A category heading plus the parts under it, ready for the template. */
export interface PartGroup {
  readonly category: PartCategory;
  readonly label: string;
  /** Material Icons ligature, so the template never maps a category itself. */
  readonly icon: string;
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
  private readonly conditionFilter = signal<PartCondition | null>(null);

  readonly parts = this.items.asReadonly();
  readonly loading = this.busy.asReadonly();
  readonly error = this.failure.asReadonly();
  readonly category = this.categoryFilter.asReadonly();
  readonly condition = this.conditionFilter.asReadonly();

  readonly isEmpty = computed(() => !this.busy() && this.items().length === 0);

  /** Parts with at least one unit free to fit. */
  readonly fittable = computed(() => this.items().filter(isFittable));
  readonly total = computed(() => this.items().length);

  /** Total units held, which is what "how many props do I have" really asks. */
  readonly unitTotal = computed(() =>
    this.items().reduce((sum, part) => sum + unitCount(part), 0),
  );

  readonly fittedTotal = computed(() =>
    this.items().reduce((sum, part) => sum + fittedCount(part), 0),
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
      icon: PART_CATEGORY_ICONS[category],
      parts,
    }));
  });

  async load(
    category: PartCategory | null = this.categoryFilter(),
    condition: PartCondition | null = this.conditionFilter(),
  ): Promise<void> {
    this.categoryFilter.set(category);
    this.conditionFilter.set(condition);
    this.busy.set(true);
    this.failure.set(null);

    try {
      const parts = await firstValueFrom(
        this.api.list({
          ...(category ? { category } : {}),
          ...(condition ? { condition } : {}),
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

  /** Units change what can be fitted, so re-read the part after any change. */
  async addUnit(partId: string, input: CreatePartUnitDto): Promise<void> {
    await firstValueFrom(this.api.addUnit(partId, input));
    await this.refresh(partId);
  }

  async updateUnit(
    partId: string,
    unitId: string,
    input: UpdatePartUnitDto,
  ): Promise<void> {
    await firstValueFrom(this.api.updateUnit(partId, unitId, input));
    await this.refresh(partId);
  }

  async removeUnit(partId: string, unitId: string): Promise<void> {
    await firstValueFrom(this.api.removeUnit(partId, unitId));
    await this.refresh(partId);
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

  private async refresh(partId: string): Promise<void> {
    this.replace(await firstValueFrom(this.api.getOne(partId)));
  }

  private replace(part: PartDto): void {
    this.items.update((parts) =>
      parts.map((existing) => (existing.id === part.id ? part : existing)),
    );
  }
}

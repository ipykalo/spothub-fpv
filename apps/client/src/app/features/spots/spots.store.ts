import { Injectable, computed, inject, signal } from '@angular/core';
import type { CreateSpotDto, SpotDto, UpdateSpotDto } from '@spothub/shared';
import { firstValueFrom } from 'rxjs';

import { SpotsApi } from './spots.api';

/**
 * Signal-backed state for spots.
 *
 * Components read signals and call intents; none of them touch HttpClient,
 * so loading and error handling live in exactly one place.
 */
@Injectable({ providedIn: 'root' })
export class SpotsStore {
  private readonly api = inject(SpotsApi);

  private readonly items = signal<readonly SpotDto[]>([]);
  private readonly busy = signal(false);
  private readonly failure = signal<string | null>(null);

  readonly spots = this.items.asReadonly();
  readonly loading = this.busy.asReadonly();
  readonly error = this.failure.asReadonly();

  readonly total = computed(() => this.items().length);
  readonly isEmpty = computed(() => !this.busy() && this.items().length === 0);

  async load(): Promise<void> {
    this.busy.set(true);
    this.failure.set(null);

    try {
      this.items.set(await firstValueFrom(this.api.list()));
    } catch {
      this.failure.set('Could not load your spots.');
    } finally {
      this.busy.set(false);
    }
  }

  async create(input: CreateSpotDto): Promise<SpotDto> {
    const created = await firstValueFrom(this.api.create(input));
    this.items.update((spots) => [created, ...spots]);

    return created;
  }

  async update(id: string, input: UpdateSpotDto): Promise<SpotDto> {
    const updated = await firstValueFrom(this.api.update(id, input));
    this.items.update((spots) => [updated, ...spots.filter((spot) => spot.id !== id)]);

    return updated;
  }

  async remove(id: string): Promise<void> {
    const snapshot = this.items();

    // Optimistic: the pin and the card disappear at once, and come back if
    // the call fails.
    this.items.update((spots) => spots.filter((spot) => spot.id !== id));

    try {
      await firstValueFrom(this.api.remove(id));
    } catch (error) {
      this.items.set(snapshot);
      throw error;
    }
  }

  find(id: string): SpotDto | undefined {
    return this.items().find((spot) => spot.id === id);
  }
}

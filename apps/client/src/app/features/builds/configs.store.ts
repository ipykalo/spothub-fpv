import { Injectable, computed, inject, signal } from '@angular/core';
import type { ConfigDto, CreateConfigDto } from '@spothub/shared';
import { firstValueFrom } from 'rxjs';

import { ConfigsApi } from './configs.api';

/**
 * Signal-backed state for one build's firmware captures.
 *
 * Components read signals and call intents; none of them touch HttpClient
 * directly, so the loading and error handling exist in exactly one place.
 */
@Injectable({ providedIn: 'root' })
export class ConfigsStore {
  private readonly api = inject(ConfigsApi);

  private readonly items = signal<readonly ConfigDto[]>([]);
  private readonly busy = signal(false);
  private readonly failure = signal<string | null>(null);

  readonly configs = this.items.asReadonly();
  readonly loading = this.busy.asReadonly();
  readonly error = this.failure.asReadonly();

  readonly isEmpty = computed(() => !this.busy() && this.items().length === 0);

  /**
   * What the quad is running now.
   *
   * The list is newest first, so the first capture is the current state —
   * which is what a firmware badge on the build should show.
   */
  readonly current = computed<ConfigDto | null>(() => this.items().at(0) ?? null);

  async load(buildId: string): Promise<void> {
    this.busy.set(true);
    this.failure.set(null);

    try {
      this.items.set(await firstValueFrom(this.api.list(buildId)));
    } catch {
      this.failure.set('Could not load the firmware captures.');
    } finally {
      this.busy.set(false);
    }
  }

  async create(buildId: string, input: CreateConfigDto): Promise<void> {
    const created = await firstValueFrom(this.api.create(buildId, input));

    // The response carries the raw text; the list deliberately does not, so
    // store the summary rather than keeping a dump in memory per capture.
    const { raw: _raw, ...summary } = created;
    this.items.update((configs) => [summary, ...configs]);
  }

  async remove(buildId: string, configId: string): Promise<void> {
    const snapshot = this.items();

    // Optimistic: the row disappears immediately and is restored if the call
    // fails, so a delete feels instant on a slow connection.
    this.items.update((configs) => configs.filter((config) => config.id !== configId));

    try {
      await firstValueFrom(this.api.remove(buildId, configId));
    } catch (error) {
      this.items.set(snapshot);
      throw error;
    }
  }

  reset(): void {
    this.items.set([]);
    this.failure.set(null);
  }
}

import { Injectable, inject, signal } from '@angular/core';
import type { BuildVideoDto, CreateBuildVideoDto } from '@spothub/shared';
import { firstValueFrom } from 'rxjs';

import { apiMessage } from '../../core/api/api-error';
import { BuildVideosApi } from './build-videos.api';

/** Signal-backed state for one build's videos. */
@Injectable({ providedIn: 'root' })
export class BuildVideosStore {
  private readonly api = inject(BuildVideosApi);

  private readonly items = signal<readonly BuildVideoDto[]>([]);
  private readonly busy = signal(false);
  private readonly adding = signal(false);
  private readonly failure = signal<string | null>(null);
  private readonly addFailure = signal<string | null>(null);

  readonly videos = this.items.asReadonly();
  readonly loading = this.busy.asReadonly();
  readonly saving = this.adding.asReadonly();
  readonly error = this.failure.asReadonly();
  /** Why the last add was refused — the build is full, say — in the API's words. */
  readonly addError = this.addFailure.asReadonly();

  async load(buildId: string): Promise<void> {
    // Another build's videos must never show under this one while it loads.
    this.items.set([]);
    this.busy.set(true);
    this.failure.set(null);

    try {
      this.items.set(await firstValueFrom(this.api.list(buildId)));
    } catch {
      this.failure.set('Could not load the videos.');
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Reads the list again, keeping what is shown until it lands: fresh cover
   * addresses for a page left open past their signature.
   */
  async refresh(buildId: string): Promise<void> {
    try {
      this.items.set(await firstValueFrom(this.api.list(buildId)));
    } catch {
      // Nothing to tell the reader: the next return to the tab asks again.
    }
  }

  /** True once added. Newest first, as the server orders them. */
  async add(buildId: string, input: CreateBuildVideoDto): Promise<boolean> {
    this.adding.set(true);
    this.addFailure.set(null);

    try {
      const created = await firstValueFrom(this.api.add(buildId, input));
      this.items.update((videos) => [created, ...videos]);
      return true;
    } catch (error) {
      this.addFailure.set(apiMessage(error, 'Could not add that video. Try again.'));
      return false;
    } finally {
      this.adding.set(false);
    }
  }

  /** Optimistic: gone at once, and back if the call fails. */
  async remove(buildId: string, videoId: string): Promise<void> {
    const snapshot = this.items();
    this.items.update((videos) => videos.filter((video) => video.id !== videoId));

    try {
      await firstValueFrom(this.api.remove(buildId, videoId));
    } catch (error) {
      this.items.set(snapshot);
      throw error;
    }
  }
}

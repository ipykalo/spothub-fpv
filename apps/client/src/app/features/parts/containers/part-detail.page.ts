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
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PART_CATEGORY_LABELS, type PartDto } from '@spothub/shared';

import { PartDetails } from '../presenters/part-details/part-details';
import { PartsApi } from '../parts.api';
import { PartsStore } from '../parts.store';

/**
 * Container: the read-only part page. Resolves which part to show and owns
 * navigation; the presenter renders it.
 */
@Component({
  selector: 'sh-part-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    RouterLink,
    PartDetails,
  ],
  templateUrl: './part-detail.page.html',
  styleUrl: './part-detail.page.scss',
})
export class PartDetailPage {
  /** Route param. Bound via `withComponentInputBinding`. */
  readonly id = input.required<string>();

  private readonly store = inject(PartsStore);
  private readonly api = inject(PartsApi);

  protected readonly part = signal<PartDto | null>(null);
  protected readonly loading = signal(true);
  protected readonly failure = signal<string | null>(null);

  /** Manufacturer and model are both optional; fall back to the category. */
  protected readonly title = computed(() => {
    const part = this.part();

    if (!part) {
      return 'Part';
    }

    const named = [part.manufacturer, part.model].filter(Boolean).join(' ');
    return named || PART_CATEGORY_LABELS[part.category];
  });

  constructor() {
    // Route inputs land after construction, so this cannot run in the ctor.
    effect(() => {
      const id = this.id();
      untracked(() => void this.hydrate(id));
    });
  }

  private async hydrate(id: string): Promise<void> {
    this.loading.set(true);
    this.failure.set(null);

    const cached = this.store.find(id);

    if (cached) {
      this.part.set(cached);
      this.loading.set(false);
      return;
    }

    try {
      this.part.set(await firstValueFrom(this.api.getOne(id)));
    } catch {
      this.failure.set('That part could not be loaded.');
    } finally {
      this.loading.set(false);
    }
  }
}

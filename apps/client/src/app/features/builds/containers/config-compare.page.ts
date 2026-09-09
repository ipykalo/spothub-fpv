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
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CONFIG_KIND_LABELS, type ConfigWithRawDto } from '@spothub/shared';

import { ConfigDiffView } from '../presenters/config-diff-view/config-diff-view';
import { buildDiffRows, diffCaveats } from '../config-diff';
import { ConfigsApi } from '../configs.api';
import { ConfigsStore } from '../configs.store';

/**
 * Container: compare two firmware captures.
 *
 * Its own route rather than another section on the build page — a
 * side-by-side diff wants the full width, and the build page is already long.
 */
@Component({
  selector: 'sh-config-compare-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressBarModule,
    MatSelectModule,
    RouterLink,
    ConfigDiffView,
  ],
  templateUrl: './config-compare.page.html',
  styleUrl: './config-compare.page.scss',
})
export class ConfigComparePage {
  /** Route param. Bound via `withComponentInputBinding`. */
  readonly id = input.required<string>();

  protected readonly configs = inject(ConfigsStore);
  private readonly api = inject(ConfigsApi);

  protected readonly leftId = signal<string | null>(null);
  protected readonly rightId = signal<string | null>(null);
  protected readonly left = signal<ConfigWithRawDto | null>(null);
  protected readonly right = signal<ConfigWithRawDto | null>(null);
  protected readonly loading = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly changesOnly = signal(false);

  protected readonly kindLabels = CONFIG_KIND_LABELS;

  protected readonly rows = computed(() => {
    const left = this.left();
    const right = this.right();

    return left && right ? buildDiffRows(left.raw, right.raw) : [];
  });

  protected readonly caveats = computed(() => {
    const left = this.left();
    const right = this.right();

    return left && right ? diffCaveats(left, right) : [];
  });

  protected readonly ready = computed(
    () => this.left() !== null && this.right() !== null,
  );

  constructor() {
    // Route inputs land after construction, so this cannot run in the ctor.
    effect(() => {
      const id = this.id();
      untracked(() => void this.start(id));
    });

    // Whenever either selection changes, fetch the text for the pair.
    effect(() => {
      const left = this.leftId();
      const right = this.rightId();

      untracked(() => {
        if (left && right) {
          void this.fetchPair(left, right);
        }
      });
    });
  }

  protected label(config: { capturedAt: string; fwVersion: string | null }): string {
    const date = config.capturedAt.slice(0, 10);
    return config.fwVersion ? `${date} · ${config.fwVersion}` : date;
  }

  private async start(buildId: string): Promise<void> {
    await this.configs.load(buildId);

    // Default to the two most recent: "what did I change last time" is the
    // question this page exists to answer.
    const captures = this.configs.configs();

    if (captures.length >= 2) {
      this.rightId.set(captures[0]?.id ?? null);
      this.leftId.set(captures[1]?.id ?? null);
    }
  }

  /** Older on the left, newer on the right, whichever way they were picked. */
  private async fetchPair(leftId: string, rightId: string): Promise<void> {
    this.loading.set(true);
    this.failure.set(null);

    try {
      const [a, b] = await Promise.all([
        firstValueFrom(this.api.getOne(this.id(), leftId)),
        firstValueFrom(this.api.getOne(this.id(), rightId)),
      ]);

      const [older, newer] = a.capturedAt <= b.capturedAt ? [a, b] : [b, a];

      this.left.set(older);
      this.right.set(newer);
    } catch {
      this.failure.set('Could not load those captures.');
    } finally {
      this.loading.set(false);
    }
  }
}

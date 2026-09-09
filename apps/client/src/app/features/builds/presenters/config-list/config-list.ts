import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CONFIG_KIND_LABELS, type ConfigDto } from '@spothub/shared';

/**
 * Presenter: the firmware captures on a build, newest first.
 *
 * Renders a list and announces intent — it owns no state and never talks to a
 * store.
 */
@Component({
  selector: 'sh-config-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './config-list.html',
  styleUrl: './config-list.scss',
})
export class ConfigList {
  readonly configs = input.required<readonly ConfigDto[]>();
  readonly pendingRemoval = input<string | null>(null);

  readonly removeRequested = output<ConfigDto>();
  readonly copyRequested = output<ConfigDto>();
  readonly downloadRequested = output<ConfigDto>();

  /** The capture whose text is being fetched, so the row can say so. */
  readonly busyId = input<string | null>(null);
  /** Briefly set after a successful copy, as the only feedback that fits a row. */
  readonly copiedId = input<string | null>(null);

  protected readonly kindLabels = CONFIG_KIND_LABELS;

  /**
   * Captures whose firmware version differs from the one before them.
   *
   * Betaflight's own guidance is that settings do not carry across versions,
   * so a flash is the point where comparing configs stops being meaningful —
   * worth marking in the list.
   */
  protected readonly flashedAt = computed(() => {
    const configs = this.configs();
    const marked = new Set<string>();

    // The list is newest first, so compare each with the one after it.
    for (let index = 0; index < configs.length - 1; index += 1) {
      const current = configs.at(index);
      const previous = configs.at(index + 1);

      if (
        current?.fwVersion &&
        previous?.fwVersion &&
        current.fwVersion !== previous.fwVersion
      ) {
        marked.add(current.id);
      }
    }

    return marked;
  });

  protected date(value: string): string {
    return value.slice(0, 10);
  }
}

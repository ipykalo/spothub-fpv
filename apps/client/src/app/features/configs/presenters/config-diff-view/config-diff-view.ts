import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
} from '@angular/core';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import type { DiffCaveat, DiffRow } from '../../config-diff';

/**
 * Presenter: two captures side by side.
 *
 * Virtual-scrolled because a `dump all` runs to a couple of thousand lines,
 * and rendering that twice puts several thousand DOM nodes on the page for
 * something the reader scrolls past in a second.
 */
@Component({
  selector: 'sh-config-diff-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ScrollingModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
  ],
  templateUrl: './config-diff-view.html',
  styleUrl: './config-diff-view.scss',
})
export class ConfigDiffView {
  readonly rows = input.required<readonly DiffRow[]>();
  readonly caveats = input<readonly DiffCaveat[]>([]);
  readonly leftLabel = input('Older');
  readonly rightLabel = input('Newer');

  /** Two-way: the container keeps it so the choice survives re-selection. */
  readonly changesOnly = model(false);

  protected readonly changeCount = computed(
    () => this.rows().filter((row) => row.kind !== 'same').length,
  );

  /**
   * With context dropped, not just the identical rows hidden.
   *
   * A bare list of changed lines loses the section they sit in — `# master`
   * versus `# profile 1` completely changes what a PID value means — so a few
   * lines either side come along.
   */
  protected readonly visible = computed<readonly DiffRow[]>(() => {
    const rows = this.rows();

    if (!this.changesOnly()) {
      return rows;
    }

    const CONTEXT = 3;
    const keep = new Set<number>();

    rows.forEach((row, index) => {
      if (row.kind === 'same') {
        return;
      }

      for (let at = index - CONTEXT; at <= index + CONTEXT; at += 1) {
        if (at >= 0 && at < rows.length) {
          keep.add(at);
        }
      }
    });

    return rows.filter((_row, index) => keep.has(index));
  });
}

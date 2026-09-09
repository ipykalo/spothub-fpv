import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { BUILD_CLASS_LABELS, BUILD_STATUS_LABELS, type BuildDto } from '@spothub/shared';

import { BUILD_STATUS_STYLES } from '../../build-status';

/**
 * Presenter: renders one build and announces intent. It owns no state, injects
 * nothing, and never talks to the store — which is what makes it trivial to
 * test and reusable on the public build pages in V4.
 */
@Component({
  selector: 'sh-build-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatCardModule, MatIconModule, RouterLink],
  templateUrl: './build-card.html',
  styleUrl: './build-card.scss',
})
export class BuildCard {
  readonly build = input.required<BuildDto>();
  readonly deleting = input(false);

  readonly delete = output<BuildDto>();

  protected readonly statusLabels = BUILD_STATUS_LABELS;
  protected readonly classLabels = BUILD_CLASS_LABELS;

  /** Icon and colour tone for the current status. */
  protected readonly style = computed(() => BUILD_STATUS_STYLES[this.build().status]);

  /**
   * The facts worth showing under the name, already filtered.
   *
   * Built here rather than as three separate @if blocks in the template, so
   * the "nothing recorded" case is one check instead of a repeated negation
   * of every field.
   */
  protected readonly meta = computed<readonly string[]>(() => {
    const build = this.build();
    const items: string[] = [];

    if (build.buildClass) {
      items.push(BUILD_CLASS_LABELS[build.buildClass]);
    }

    if (build.weightG) {
      items.push(`${build.weightG} g`);
    }

    if (build.hasGps) {
      items.push('GPS');
    }

    return items;
  });
}

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { BUILD_CLASS_LABELS, BUILD_STATUS_LABELS, type BuildDto } from '@spothub/shared';

/**
 * Presenter: renders one build and announces intent. It owns no state, injects
 * nothing, and never talks to the store — which is what makes it trivial to
 * test and reusable on the public build pages in V4.
 */
@Component({
  selector: 'sh-build-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatCardModule, RouterLink],
  templateUrl: './build-card.html',
  styleUrl: './build-card.scss',
})
export class BuildCard {
  readonly build = input.required<BuildDto>();
  readonly deleting = input(false);

  readonly delete = output<BuildDto>();

  protected readonly statusLabels = BUILD_STATUS_LABELS;
  protected readonly classLabels = BUILD_CLASS_LABELS;
}

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { BUILD_STATUS_LABELS, type BuildStatus } from '@spothub/shared';

/** Presenter: the status chip row. Reports a choice, decides nothing. */
@Component({
  selector: 'sh-build-status-filter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatChipsModule],
  templateUrl: './build-status-filter.html',
  styleUrl: './build-status-filter.scss',
})
export class BuildStatusFilter {
  readonly statuses = input.required<readonly BuildStatus[]>();
  readonly selected = input<BuildStatus | null>(null);

  readonly selectedChange = output<BuildStatus | null>();

  protected readonly statusLabels = BUILD_STATUS_LABELS;
}

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { REPAIR_CAUSE_LABELS, type RepairDto } from '@spothub/shared';

import { REPAIR_CAUSE_STYLES } from '../../repair-cause';

/**
 * Presenter: what has gone wrong with this build, newest first. Renders a
 * list and announces intent — it owns no state and never talks to a store.
 */
@Component({
  selector: 'sh-repair-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './repair-timeline.html',
  styleUrl: './repair-timeline.scss',
})
export class RepairTimeline {
  readonly repairs = input.required<readonly RepairDto[]>();
  readonly pendingRemoval = input<string | null>(null);

  readonly removeRequested = output<RepairDto>();

  protected readonly causeLabels = REPAIR_CAUSE_LABELS;
  protected readonly causeStyles = REPAIR_CAUSE_STYLES;
}

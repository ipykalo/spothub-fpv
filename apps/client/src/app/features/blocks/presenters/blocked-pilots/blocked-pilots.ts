import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import type { BlockedPilotDto } from '@spothub/shared';

/**
 * Presenter: the pilots someone blocked, each with Unblock. Unblocking needs
 * no confirmation: it can be done again from any of their comments.
 */
@Component({
  selector: 'sh-blocked-pilots',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MatButtonModule],
  templateUrl: './blocked-pilots.html',
  styleUrl: './blocked-pilots.scss',
})
export class BlockedPilots {
  readonly pilots = input.required<readonly BlockedPilotDto[]>();
  readonly saving = input(false);
  readonly error = input<string | null>(null);
  readonly unblocked = output<BlockedPilotDto>();
}

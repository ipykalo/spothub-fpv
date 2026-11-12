import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/**
 * Presenter: ends every session the pilot has — for a phone left signed in,
 * a borrowed laptop, or a doubt. Not a deletion, so no confirmation: the
 * worst it does is ask for a Google sign-in again.
 */
@Component({
  selector: 'sh-sign-out-everywhere',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './sign-out-everywhere.html',
  styleUrl: './sign-out-everywhere.scss',
})
export class SignOutEverywhere {
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  readonly requested = output();
}

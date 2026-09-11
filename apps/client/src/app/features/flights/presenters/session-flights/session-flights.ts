import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { FlightDto, SessionDto } from '@spothub/shared';

import { Autocomplete } from '../../../../core/components/autocomplete/autocomplete';
import type { ChoiceOption } from '../../../../core/components/choice-option';

/** The radio's clock, shown as recorded: stored as UTC, so rendered as UTC. */
const CLOCK = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

/**
 * Presenter: the flights of one outing.
 *
 * Battery and link figures lead, because every log has them; the track
 * figures follow only when the quad carries GPS. Renders and announces
 * intent — it owns no state and never talks to a store.
 */
@Component({
  selector: 'sh-session-flights',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Autocomplete, MatButtonModule, MatIconModule],
  templateUrl: './session-flights.html',
  styleUrl: './session-flights.scss',
})
export class SessionFlights {
  readonly session = input.required<SessionDto>();
  readonly builds = input<readonly ChoiceOption<string>[]>([]);
  readonly pendingRemoval = input<string | null>(null);

  readonly buildChanged = output<{ flight: FlightDto; buildId: string | null }>();
  readonly removeRequested = output<FlightDto>();

  protected time(iso: string): string {
    return CLOCK.format(new Date(iso));
  }

  protected duration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    return `${String(minutes)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  protected distance(metres: number): string {
    return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${String(metres)} m`;
  }

  protected changeBuild(flight: FlightDto, buildId: string | null): void {
    if (buildId !== flight.buildId) {
      this.buildChanged.emit({ flight, buildId });
    }
  }
}

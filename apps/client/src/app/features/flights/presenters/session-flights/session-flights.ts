import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
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
 * figures follow only when the quad carries GPS. Which flights are ticked is
 * the container's to keep — a selection can span several outings — so this
 * shows it and announces changes to it. Owns no state and never talks to a
 * store.
 */
@Component({
  selector: 'sh-session-flights',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Autocomplete, MatButtonModule, MatCheckboxModule, MatIconModule],
  templateUrl: './session-flights.html',
  styleUrl: './session-flights.scss',
})
export class SessionFlights {
  readonly session = input.required<SessionDto>();
  readonly builds = input<readonly ChoiceOption<string>[]>([]);
  readonly batteries = input<readonly ChoiceOption<string>[]>([]);
  readonly selected = input<ReadonlySet<string>>(new Set());
  readonly pendingRemoval = input<string | null>(null);

  readonly buildChanged = output<{ flight: FlightDto; buildId: string | null }>();
  readonly batteryChanged = output<{ flight: FlightDto; batteryUnitId: string | null }>();
  readonly selectionChanged = output<{ flightIds: readonly string[]; selected: boolean }>();
  readonly removeRequested = output<FlightDto>();

  protected readonly allSelected = computed(() => {
    const selected = this.selected();
    return this.session().flights.every((flight) => selected.has(flight.id));
  });

  protected readonly someSelected = computed(() => {
    const selected = this.selected();

    return (
      !this.allSelected() && this.session().flights.some((flight) => selected.has(flight.id))
    );
  });

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

  protected changeBattery(flight: FlightDto, batteryUnitId: string | null): void {
    if (batteryUnitId !== flight.batteryUnitId) {
      this.batteryChanged.emit({ flight, batteryUnitId });
    }
  }

  protected select(flight: FlightDto, selected: boolean): void {
    this.selectionChanged.emit({ flightIds: [flight.id], selected });
  }

  protected selectAll(selected: boolean): void {
    this.selectionChanged.emit({
      flightIds: this.session().flights.map((flight) => flight.id),
      selected,
    });
  }
}

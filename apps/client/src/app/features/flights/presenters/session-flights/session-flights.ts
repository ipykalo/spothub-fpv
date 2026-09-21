import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import type {
  FlightDto,
  FlightTimelineDto,
  FlightTrackDto,
  SessionDto,
} from '@spothub/shared';

import { Autocomplete } from '../../../../core/components/autocomplete/autocomplete';
import type { ChoiceOption } from '../../../../core/components/choice-option';
import { FlightMap } from '../flight-map/flight-map';
import { FlightTimeline } from '../flight-timeline/flight-timeline';

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
  imports: [
    FlightMap,
    FlightTimeline,
    Autocomplete,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
  ],
  templateUrl: './session-flights.html',
  styleUrl: './session-flights.scss',
})
export class SessionFlights {
  readonly session = input.required<SessionDto>();
  readonly builds = input<readonly ChoiceOption<string>[]>([]);
  readonly batteries = input<readonly ChoiceOption<string>[]>([]);
  readonly selected = input<ReadonlySet<string>>(new Set());
  readonly pendingRemoval = input<string | null>(null);
  /** Which flight's path is open, and what has been read of it so far. */
  readonly openTrackFlightId = input<string | null>(null);
  readonly track = input<FlightTrackDto | null>(null);
  readonly trackLoading = input(false);
  readonly trackError = input<string | null>(null);
  /** Which flight is open as charts, and what has been read of it so far. */
  readonly openTimelineFlightId = input<string | null>(null);
  readonly timeline = input<FlightTimelineDto | null>(null);
  readonly timelineLoading = input(false);
  readonly timelineError = input<string | null>(null);

  readonly buildChanged = output<{ flight: FlightDto; buildId: string | null }>();
  readonly batteryChanged = output<{ flight: FlightDto; batteryUnitId: string | null }>();
  readonly selectionChanged = output<{
    flightIds: readonly string[];
    selected: boolean;
  }>();
  readonly removeRequested = output<FlightDto>();
  /** Show this flight's path, or hide it when it is the one already open. */
  readonly trackRequested = output<FlightDto>();
  /** Show this flight second by second, or hide it when it is already open. */
  readonly timelineRequested = output<FlightDto>();

  protected readonly allSelected = computed(() => {
    const selected = this.selected();
    return this.session().flights.every((flight) => selected.has(flight.id));
  });

  protected readonly someSelected = computed(() => {
    const selected = this.selected();

    return (
      !this.allSelected() &&
      this.session().flights.some((flight) => selected.has(flight.id))
    );
  });

  /**
   * Whether there is anything to chart: a GPX track knows where the quad was
   * and nothing about what it was doing, so a flight that came in as one has
   * no second-by-second story to tell.
   */
  protected hasFigures(flight: FlightDto): boolean {
    return (
      flight.startVoltage !== null ||
      flight.minLinkQuality !== null ||
      flight.avgThrottlePct !== null
    );
  }

  /** A blackbox flight records no time of day; its place in the list is its order. */
  protected when(flight: FlightDto): string {
    return flight.timeRecorded
      ? CLOCK.format(new Date(flight.startedAt))
      : 'time not recorded';
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

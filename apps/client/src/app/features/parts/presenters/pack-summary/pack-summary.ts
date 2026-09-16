import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import {
  PART_CONDITION_LABELS,
  type FlightDto,
  type PartDto,
  type PartUnitDto,
} from '@spothub/shared';

import { PART_CONDITION_STYLES, unitName } from '../../part-condition';

/** One pack's history, drawn from the flights flown on it. */
export interface PackStats {
  readonly unit: PartUnitDto;
  readonly name: string;
  /**
   * Flights flown on the pack. A log records no charge, so each flight is
   * taken as one cycle — the count a pack's rated cycle life is judged by.
   */
  readonly cycles: number;
  readonly airtimeS: number;
  /** Take-off voltage minus the flight's lowest, averaged over flights that logged both. */
  readonly averageSagV: number | null;
  readonly lowestVoltage: number | null;
  readonly lastFlownAt: string | null;
}

/**
 * Every unit of the part, flown or not, in the part's own order — so a pack
 * that has never been flown still shows, with nothing against it.
 */
export function packStats(
  part: PartDto,
  flights: readonly FlightDto[],
): readonly PackStats[] {
  return part.units.map((unit) => {
    const own = flights.filter((flight) => flight.batteryUnitId === unit.id);

    const sags = own.flatMap((flight) =>
      flight.startVoltage !== null && flight.minVoltage !== null
        ? [flight.startVoltage - flight.minVoltage]
        : [],
    );
    const lows = own.flatMap((flight) =>
      flight.minVoltage === null ? [] : [flight.minVoltage],
    );

    // ISO timestamps in one format compare correctly as strings.
    const lastFlownAt = own.reduce<string | null>(
      (latest, flight) =>
        latest === null || flight.startedAt > latest ? flight.startedAt : latest,
      null,
    );

    return {
      unit,
      name: unitName(part, unit),
      cycles: own.length,
      airtimeS: own.reduce((sum, flight) => sum + flight.durationS, 0),
      averageSagV:
        sags.length > 0 ? sags.reduce((sum, sag) => sum + sag, 0) / sags.length : null,
      lowestVoltage: lows.length > 0 ? Math.min(...lows) : null,
      lastFlownAt,
    };
  });
}

/** The radio's clock, stored as UTC, so rendered as UTC. */
const SHORT_DATE = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * Presenter: each pack of a battery part side by side — how hard it has been
 * used and how it is holding up. A pack's name picks it for the charts below;
 * which one is picked is the container's to keep.
 */
@Component({
  selector: 'sh-pack-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  templateUrl: './pack-summary.html',
  styleUrl: './pack-summary.scss',
})
export class PackSummary {
  readonly part = input.required<PartDto>();
  /** The flights flown on any of the part's packs. */
  readonly flights = input.required<readonly FlightDto[]>();
  readonly selected = input<string | null>(null);

  /** A unit id to show only that pack, or null for every pack again. */
  readonly packChosen = output<string | null>();

  protected readonly rows = computed(() => packStats(this.part(), this.flights()));
  protected readonly conditionStyles = PART_CONDITION_STYLES;
  protected readonly conditionLabels = PART_CONDITION_LABELS;

  protected choose(unitId: string): void {
    this.packChosen.emit(this.selected() === unitId ? null : unitId);
  }

  protected airtime(seconds: number): string {
    const minutes = Math.round(seconds / 60);

    return minutes >= 60
      ? `${String(Math.floor(minutes / 60))} h ${String(minutes % 60).padStart(2, '0')} min`
      : `${String(minutes)} min`;
  }

  protected date(iso: string): string {
    return SHORT_DATE.format(new Date(iso));
  }
}

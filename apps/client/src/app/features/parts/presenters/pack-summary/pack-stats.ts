import type { FlightDto, PartDto, PartUnitDto } from '@spothub/shared';

import { unitName } from '../../part-condition';

/**
 * What a battery pack's row is made of, worked out from the flights flown on
 * it. Pure, and kept apart from the component that shows it so it can be
 * tested without a DOM — the arithmetic is the part worth holding down, since
 * a wrong reading would have a pilot bin a healthy pack or fly a tired one.
 */
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
  /**
   * The charge drawn on an average flight, from the logs that recorded it. A
   * pack that keeps its capacity gives the same mAh for the same flying; one
   * that is going gives less, and lands sooner.
   */
  readonly averageMahUsed: number | null;
  /**
   * How the pack's sag is moving: the average sag of its recent flights
   * against its earliest ones, as a fraction — 0.2 is a fifth worse than it
   * started. Null until enough flights logged voltage for the comparison to
   * mean anything; wear shows over a pack's life, not over two flights.
   */
  readonly sagTrend: number | null;
  readonly lastFlownAt: string | null;
}

/** Below this, a pack has not flown enough for early and recent to be different things. */
const TREND_MINIMUM_FLIGHTS = 6;

/** A fifth more sag than the pack started with: the point worth showing as wear. */
export const TIRED_SAG_TREND = 0.2;

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

    const sags = own.flatMap(sagOf);
    const lows = own.flatMap((flight) =>
      flight.minVoltage === null ? [] : [flight.minVoltage],
    );
    const charges = own.flatMap((flight) =>
      flight.mahUsed === null ? [] : [flight.mahUsed],
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
      averageSagV: sags.length > 0 ? average(sags) : null,
      lowestVoltage: lows.length > 0 ? Math.min(...lows) : null,
      averageMahUsed: charges.length > 0 ? average(charges) : null,
      sagTrend: sagTrend(own),
      lastFlownAt,
    };
  });
}

/** How far the pack fell on that flight, when it logged both ends. */
function sagOf(flight: FlightDto): number[] {
  return flight.startVoltage !== null && flight.minVoltage !== null
    ? [flight.startVoltage - flight.minVoltage]
    : [];
}

const average = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * The pack's sag now against the sag it started with, comparing its first
 * third of flights with its last third: the middle left out, so one bad flight
 * in the middle of a pack's life does not read as wear.
 */
function sagTrend(flights: readonly FlightDto[]): number | null {
  const sags = [...flights]
    // ISO timestamps in one format compare correctly as strings.
    .sort((first, second) => first.startedAt.localeCompare(second.startedAt))
    .flatMap(sagOf);

  if (sags.length < TREND_MINIMUM_FLIGHTS) {
    return null;
  }

  const span = Math.floor(sags.length / 3);
  const early = average(sags.slice(0, span));
  const recent = average(sags.slice(-span));

  // A pack that never sagged at all has nothing to have grown from.
  return early > 0 ? (recent - early) / early : null;
}

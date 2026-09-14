/**
 * What every log parser produces, whatever the format: flights, the rules
 * that cut a log into them, and the arithmetic they are summarised with.
 * Pure, like the parsers themselves.
 */

/** A pause longer than this ends one flight and starts another. */
export const SPLIT_GAP_MS = 30_000;

/** Shorter than this is a radio switched on or an arm check, not a flight. */
export const MIN_FLIGHT_MS = 10_000;

export interface ParsedFlight {
  readonly startedAt: Date;
  readonly endedAt: Date;
  /**
   * False when the log records no time of day — a blackbox log, placed on the
   * day it was said to be flown. Its times then only order its flights.
   */
  readonly timeRecorded: boolean;
  readonly durationS: number;
  readonly sampleCount: number;
  readonly startVoltage: number | null;
  readonly minVoltage: number | null;
  readonly endVoltage: number | null;
  readonly mahUsed: number | null;
  readonly maxCurrentA: number | null;
  readonly minLinkQuality: number | null;
  /** The weakest signal the receiver heard, in dBm, on its better antenna. */
  readonly minRssiDbm: number | null;
  readonly minSnrDb: number | null;
  /** The telemetry link back from the quad, as the radio measured it. */
  readonly minDownlinkQuality: number | null;
  readonly maxTxPowerMw: number | null;
  /** Where the throttle stick sat, 0–100 %: the stick, not the motors. */
  readonly avgThrottlePct: number | null;
  readonly maxThrottlePct: number | null;
  /** The radio's own battery. */
  readonly minRadioVoltage: number | null;
  readonly hasGps: boolean;
  readonly distanceM: number | null;
  readonly maxAltitudeM: number | null;
  readonly maxSpeedKmh: number | null;
  readonly maxHomeDistanceM: number | null;
}

export interface ParsedLog {
  /** What the log calls the quad: the radio model, or a blackbox's craft name. */
  readonly modelName: string | null;
  readonly flights: readonly ParsedFlight[];
  /** Stretches too short to be a flight, dropped rather than stored. */
  readonly discarded: number;
  /** Rows or frames that carried a readable timestamp. */
  readonly rowCount: number;
}

/** The file is not a log of its format at all, as opposed to one with no flights. */
export class LogParseError extends Error {}

export function values<T>(rows: readonly T[], pick: (row: T) => number | null): number[] {
  const result: number[] = [];

  for (const row of rows) {
    const value = pick(row);

    if (value !== null) {
      result.push(value);
    }
  }

  return result;
}

/**
 * A loop, not `Math.min(...list)`: a blackbox flight has tens of thousands of
 * frames, more than a spread into function arguments can hold.
 */
export function minOf(list: readonly number[]): number | undefined {
  let lowest: number | undefined;

  for (const value of list) {
    if (lowest === undefined || value < lowest) {
      lowest = value;
    }
  }

  return lowest;
}

export function maxOf(list: readonly number[]): number | undefined {
  let highest: number | undefined;

  for (const value of list) {
    if (highest === undefined || value > highest) {
      highest = value;
    }
  }

  return highest;
}

export function meanOf(list: readonly number[]): number | undefined {
  return list.length > 0
    ? list.reduce((sum, value) => sum + value, 0) / list.length
    : undefined;
}

export function round(value: number | undefined, digits: number): number | null {
  if (value === undefined) {
    return null;
  }

  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * What every log parser produces, whatever the format: flights, the rules
 * that cut a log into them, and the arithmetic they are summarised with.
 * Pure, like the parsers themselves.
 */

// A type-only import, erased at compile time: the parsers stay pure and their
// specs load nothing from Nest.
import type { FlightFigures } from '../../flights';

/** A pause longer than this ends one flight and starts another. */
export const SPLIT_GAP_MS = 30_000;

/** Shorter than this is a radio switched on or an arm check, not a flight. */
export const MIN_FLIGHT_MS = 10_000;

/** A flight as a log describes it — the figures the logbook stores. */
export type ParsedFlight = FlightFigures;

export interface ParsedLog {
  /** What the log calls the quad: the radio model, or a blackbox's craft name. */
  readonly modelName: string | null;
  readonly flights: readonly ParsedFlight[];
  /** Stretches too short to be a flight, dropped rather than stored. */
  readonly discarded: number;
  /** Rows or frames that carried a readable timestamp. */
  readonly rowCount: number;
  /**
   * True for a log of GPS tracks alone — a GPX file. Each track joins the
   * flight it overlaps instead of being stored beside it; only a track that
   * overlaps none becomes a flight of its own.
   */
  readonly tracksOnly?: boolean;
}

/** The file is not a log of its format at all, as opposed to one with no flights. */
/**
 * One moment of a flight as its log recorded it, with the clock the flight is
 * stored against — so a sample can be placed inside a flight's own window.
 *
 * Every format fills in what it has: a radio log knows the link and the
 * sticks, a blackbox log knows what the pack was actually doing.
 */
export interface LogSample {
  readonly t: number;
  readonly voltage: number | null;
  readonly currentA: number | null;
  readonly throttlePct: number | null;
  readonly linkQuality: number | null;
}

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

/**
 * Which stored flight a GPS track belongs to.
 *
 * A GPX file records true UTC. A radio log records the radio's own clock,
 * which is usually set to local time, so the same flight can sit hours apart
 * in the two. The track is tried as recorded first, then shifted by whole
 * quarter hours — every real time-zone offset is one — nearest first. It
 * belongs to a flight only when exactly one flight's take-off and landing
 * both line up at the first shift where any flight does; two that fit equally
 * well would make the choice a guess.
 *
 * Pure: the repository loads the candidates and applies the answer.
 */

/** How far a take-off or landing may be from the track's and still line up. */
export const TRACK_TOLERANCE_MS = 30_000;

const QUARTER_HOUR_MS = 15 * 60_000;

/** The time zones in use run from UTC−12 to UTC+14. */
const EARLIEST_OFFSET_MS = -12 * 60 * 60_000;
const LATEST_OFFSET_MS = 14 * 60 * 60_000;

/**
 * How far either side of a track a candidate flight can be: the largest
 * offset plus the tolerance. The repository loads flights in this window.
 */
export const TRACK_SEARCH_WINDOW_MS =
  Math.max(-EARLIEST_OFFSET_MS, LATEST_OFFSET_MS) + TRACK_TOLERANCE_MS;

export interface TimeSpan {
  readonly startedAt: Date;
  readonly endedAt: Date;
}

export interface CandidateFlight extends TimeSpan {
  readonly id: string;
}

export interface TrackMatch {
  readonly flightId: string;
  /** How far ahead of UTC the flight's clock was. */
  readonly offsetMs: number;
}

/** 0, then +15 min, −15 min, +30 min, −30 min … out to both ends of the range. */
function offsets(): number[] {
  const tried = [0];

  for (let step = QUARTER_HOUR_MS; step <= LATEST_OFFSET_MS; step += QUARTER_HOUR_MS) {
    tried.push(step);

    if (-step >= EARLIEST_OFFSET_MS) {
      tried.push(-step);
    }
  }

  return tried;
}

const OFFSETS = offsets();

export function matchTrack(
  track: TimeSpan,
  flights: readonly CandidateFlight[],
): TrackMatch | null {
  for (const offsetMs of OFFSETS) {
    const start = track.startedAt.getTime() + offsetMs;
    const end = track.endedAt.getTime() + offsetMs;

    const lined = flights.filter(
      (flight) =>
        Math.abs(flight.startedAt.getTime() - start) <= TRACK_TOLERANCE_MS &&
        Math.abs(flight.endedAt.getTime() - end) <= TRACK_TOLERANCE_MS,
    );

    if (lined.length === 1) {
      return { flightId: lined[0].id, offsetMs };
    }

    if (lined.length > 1) {
      return null;
    }
  }

  return null;
}

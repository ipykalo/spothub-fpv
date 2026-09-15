/**
 * What a GPS track adds up to, whichever log it came from: how far the quad
 * flew, how high above take-off, how fast, and how far from home. Pure.
 */

import { type ParsedFlight, maxOf, round } from './parsed-log';

/** Consecutive GPS fixes implying more than this are a glitch, not movement. */
const MAX_PLAUSIBLE_SPEED_MS = 100;

/** Speed measured from positions is taken over at least this long: fix to fix is mostly noise. */
const SPEED_WINDOW_MS = 1_000;

export interface Fix {
  readonly t: number;
  readonly lat: number;
  readonly lon: number;
  readonly altitude: number | null;
}

export type TrackFigures = Pick<
  ParsedFlight,
  'hasGps' | 'distanceM' | 'maxAltitudeM' | 'maxSpeedKmh' | 'maxHomeDistanceM'
>;

const NO_TRACK: TrackFigures = {
  hasGps: false,
  distanceM: null,
  maxAltitudeM: null,
  maxSpeedKmh: null,
  maxHomeDistanceM: null,
};

/**
 * The figures for fixes in time order. `speedsKmh` are the log's own speed
 * readings when it has a speed sensor; without them — a GPX track records
 * none — speed is measured from the positions.
 */
export function summariseTrack(
  fixes: readonly Fix[],
  speedsKmh?: readonly number[],
): TrackFigures {
  const home = fixes.at(0);

  if (!home || fixes.length < 2) {
    return NO_TRACK;
  }

  let distance = 0;
  let farthest = 0;
  let fastest: number | undefined;
  let windowStart = home;
  let windowDistance = 0;

  for (let index = 1; index < fixes.length; index += 1) {
    const from = fixes[index - 1];
    const to = fixes[index];
    const step = haversineM(from, to);
    const seconds = Math.max((to.t - from.t) / 1000, 0.001);

    // A fix that jumps faster than any quad flies is the receiver guessing.
    if (step / seconds <= MAX_PLAUSIBLE_SPEED_MS) {
      distance += step;
      windowDistance += step;
    }

    farthest = Math.max(farthest, haversineM(home, to));

    if (to.t - windowStart.t >= SPEED_WINDOW_MS) {
      const kmh = (windowDistance / ((to.t - windowStart.t) / 1000)) * 3.6;
      fastest = fastest === undefined ? kmh : Math.max(fastest, kmh);
      windowStart = to;
      windowDistance = 0;
    }
  }

  const altitudes = fixes
    .map((fix) => fix.altitude)
    .filter((altitude): altitude is number => altitude !== null);

  return {
    hasGps: true,
    distanceM: Math.round(distance),
    // Relative to where it took off: GPS altitude is above sea level, and
    // "flew 480 m up" is not what anyone means.
    maxAltitudeM:
      home.altitude !== null && altitudes.length > 0
        ? round((maxOf(altitudes) ?? home.altitude) - home.altitude, 1)
        : null,
    maxSpeedKmh: round(speedsKmh === undefined ? fastest : maxOf(speedsKmh), 1),
    maxHomeDistanceM: Math.round(farthest),
  };
}

/** Great-circle distance in metres. Plenty accurate at the scale of a field. */
export function haversineM(a: Fix, b: Fix): number {
  const radius = 6_371_000;
  const toRad = (degrees: number): number => (degrees * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;

  return 2 * radius * Math.asin(Math.sqrt(h));
}

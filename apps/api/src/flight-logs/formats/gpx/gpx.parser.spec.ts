import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { LogParseError, SPLIT_GAP_MS } from '../parsed-log';
import { parseGpx } from './gpx.parser';

interface Point {
  /** Seconds after 16:00:00Z on 2026-09-14. */
  readonly s: number;
  /** Steps north of 51.5°, 0.0001° (about 11.12 m) each. */
  readonly north: number;
  readonly ele?: number;
}

function gpx(points: readonly Point[], name = 'Air65'): string {
  const trkpts = points.map((point) => {
    const time = new Date(Date.UTC(2026, 8, 14, 16, 0, 0) + point.s * 1000).toISOString();
    const ele = point.ele === undefined ? '' : `<ele>${String(point.ele)}</ele>`;

    return `<trkpt lat="${(51.5 + point.north * 0.0001).toFixed(6)}" lon="-0.1">${ele}<time>${time}</time></trkpt>`;
  });

  return `<?xml version="1.0"?><gpx version="1.1"><metadata><name>Morning flight</name></metadata><trk><name>${name}</name><trkseg>${trkpts.join('')}</trkseg></trk></gpx>`;
}

/** Straight north at one step a second, climbing 0.5 m a second. */
function straight(from: number, seconds: number): Point[] {
  return Array.from({ length: seconds + 1 }, (_, i) => ({ s: from + i, north: i, ele: 100 + i * 0.5 }));
}

describe('parseGpx', () => {
  it('reads a timed track into a flight with GPS figures and nothing else', () => {
    const log = parseGpx(gpx(straight(0, 20)));

    expect(log.tracksOnly).toBe(true);
    expect(log.modelName).toBe('Air65');
    expect(log.flights).toHaveLength(1);

    const [flight] = log.flights;
    expect(flight.startedAt.toISOString()).toBe('2026-09-14T16:00:00.000Z');
    expect(flight.durationS).toBe(20);
    expect(flight.timeRecorded).toBe(true);
    expect(flight.hasGps).toBe(true);
    expect(flight.distanceM).toBe(222);
    expect(flight.maxHomeDistanceM).toBe(222);
    expect(flight.maxAltitudeM).toBe(10);
    // 11.12 m a second, measured from the positions: a GPX track has no speed.
    expect(flight.maxSpeedKmh).toBe(40);
    expect(flight.startVoltage).toBeNull();
    expect(flight.minLinkQuality).toBeNull();
    expect(flight.avgThrottlePct).toBeNull();
  });

  it('reads points whatever the attribute order or quoting, and skips untimed ones', () => {
    const text =
      "<gpx><trk><trkseg><trkpt lon='-0.1' lat='51.5'><time>2026-09-14T16:00:00Z</time></trkpt>" +
      '<trkpt lat="51.5001" lon="-0.1"/>' +
      '<trkpt lat="51.5002" lon="-0.1"><time>2026-09-14T16:00:20Z</time></trkpt></trkseg></trk></gpx>';

    const log = parseGpx(text);

    expect(log.rowCount).toBe(2);
    expect(log.modelName).toBeNull();
    expect(log.flights[0].durationS).toBe(20);
    expect(log.flights[0].maxAltitudeM).toBeNull();
  });

  it('starts a new track after a long pause, and drops one too short to be a flight', () => {
    const later = SPLIT_GAP_MS / 1000 + 60;
    const log = parseGpx(gpx([...straight(0, 20), ...straight(later, 25), ...straight(later + 120, 5)]));

    expect(log.flights.map((flight) => flight.durationS)).toEqual([20, 25]);
    expect(log.discarded).toBe(1);
  });

  it('reads the synthetic Air65 loop as one track, in UTC', () => {
    const log = parseGpx(readFileSync(join(__dirname, '__fixtures__', 'air65-loop-utc.gpx'), 'utf8'));

    expect(log.modelName).toBe('Air65');
    expect(log.rowCount).toBe(600);
    expect(log.flights).toHaveLength(1);

    const [flight] = log.flights;
    // Two hours before the radio log it was made from: a radio on CEST.
    expect(flight.startedAt.toISOString()).toBe('2026-09-14T16:32:13.000Z');
    expect(flight.endedAt.toISOString()).toBe('2026-09-14T16:34:12.800Z');
    expect(flight.durationS).toBe(120);
    expect(flight.sampleCount).toBe(600);
    expect(flight.distanceM).toBe(301);
    expect(flight.maxHomeDistanceM).toBe(80);
    expect(flight.maxAltitudeM).toBe(3);
    // Measured from the positions: 301 m in two minutes. The radio log's own
    // speed column claims up to 16 kts, which its synthetic track never flies.
    expect(flight.maxSpeedKmh).toBe(9.3);
  });

  it('refuses a file that is not GPX, or has no timed points', () => {
    expect(() => parseGpx('Date,Time\n')).toThrow(LogParseError);
    expect(() => parseGpx('<gpx><trk><trkseg><trkpt lat="1" lon="2"/></trkseg></trk></gpx>')).toThrow(
      LogParseError,
    );
  });
});

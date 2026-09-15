import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { LogParseError } from '../parsed-log';
import { blackboxOrigin, craftNameFrom, parseBlackboxLogs } from './blackbox-csv.parser';

/** The columns the parser reads, named and spaced the way blackbox_decode writes them. */
const HEADER =
  'loopIteration, time (s), rcCommand[3], vbatLatest (V), amperageLatest (A), flightModeFlags (flags)';

interface LogShape {
  /** Seconds since power-on of the first frame. */
  readonly start: number;
  readonly seconds: number;
  readonly amps?: number;
  readonly throttle?: number;
  readonly volts?: number;
  /** How far one frame, halfway through, sags below `volts`. */
  readonly sag?: number;
}

/** One decoded log, ten frames a second. */
function log({ start, seconds, amps = 10, throttle = 1500, volts = 16.8, sag = 0 }: LogShape): string {
  const frames = Math.round(seconds * 10);
  const rows = [HEADER];

  for (let index = 0; index <= frames; index += 1) {
    const voltage = index === Math.floor(frames / 2) ? volts - sag : volts;
    rows.push(
      [index, (start + index / 10).toFixed(3), throttle, voltage.toFixed(2), amps.toFixed(2), 'ANGLE_MODE'].join(
        ', ',
      ),
    );
  }

  return rows.join('\n');
}

const ORIGIN = Date.UTC(2026, 8, 13);

describe('parseBlackboxLogs', () => {
  it('joins a re-arm into the flight before it, and places the flight after power-on', () => {
    const { flights, discarded } = parseBlackboxLogs(
      [log({ start: 7, seconds: 20 }), log({ start: 29, seconds: 15 })],
      'Cinelog  20',
      ORIGIN,
    );

    expect(discarded).toBe(0);
    expect(flights).toHaveLength(1);

    const [flight] = flights;
    expect(flight.startedAt.getTime()).toBe(ORIGIN + 7000);
    expect(flight.durationS).toBe(37);
    expect(flight.timeRecorded).toBe(false);
  });

  it('starts a new flight after a long pause, and drops what is too short to be one', () => {
    const { flights, discarded } = parseBlackboxLogs(
      [
        log({ start: 7, seconds: 15 }),
        log({ start: 60, seconds: 5 }),
        log({ start: 100, seconds: 12 }),
      ],
      null,
      ORIGIN,
    );

    expect(flights.map((flight) => flight.durationS)).toEqual([15, 12]);
    expect(discarded).toBe(1);
  });

  it('counts charge from current over time, but not across the disarm between two logs', () => {
    // 10 A for 36 s is 100 mAh; the 2 s between the logs is not flight.
    const [flight] = parseBlackboxLogs(
      [log({ start: 0, seconds: 36, amps: 10 }), log({ start: 38, seconds: 36, amps: 10 })],
      null,
      ORIGIN,
    ).flights;

    expect(flight.mahUsed).toBe(200);
    expect(flight.maxCurrentA).toBe(10);
  });

  it('reports no current or charge when the sensor only reads below zero', () => {
    const [flight] = parseBlackboxLogs([log({ start: 0, seconds: 20, amps: -3 })], null, ORIGIN).flights;

    expect(flight.maxCurrentA).toBeNull();
    expect(flight.mahUsed).toBeNull();
  });

  it('reads pack voltage, its sag, and where the throttle sat', () => {
    const [flight] = parseBlackboxLogs(
      [log({ start: 0, seconds: 20, volts: 16.8, sag: 2.1, throttle: 1400 })],
      null,
      ORIGIN,
    ).flights;

    expect(flight.startVoltage).toBe(16.8);
    expect(flight.minVoltage).toBe(14.7);
    expect(flight.endVoltage).toBe(16.8);
    expect(flight.avgThrottlePct).toBe(40);
    expect(flight.maxThrottlePct).toBe(40);
    expect(flight.hasGps).toBe(false);
    expect(flight.minLinkQuality).toBeNull();
  });

  it('reads frame times in microseconds, the decoder default', () => {
    const csv = [
      'loopIteration, time (us), rcCommand[3], vbatLatest (V), amperageLatest (A)',
      ...Array.from({ length: 121 }, (_, index) =>
        [index, 5_000_000 + index * 100_000, 1500, 16.5, 8].join(', '),
      ),
    ].join('\n');

    const [flight] = parseBlackboxLogs([csv], null, ORIGIN).flights;

    expect(flight.startedAt.getTime()).toBe(ORIGIN + 5000);
    expect(flight.durationS).toBe(12);
  });

  it('skips an empty log, and refuses a file where no log has frame times', () => {
    expect(parseBlackboxLogs(['', log({ start: 0, seconds: 12 })], null, ORIGIN).flights).toHaveLength(1);
    expect(() => parseBlackboxLogs(['', ''], null, ORIGIN)).toThrow(LogParseError);
    expect(() => parseBlackboxLogs(['loopIteration, motor[0]\n1, 1000'], null, ORIGIN)).toThrow(
      LogParseError,
    );
  });
});

describe('craftNameFrom', () => {
  it('reads the craft name from the log header, spaces and all', () => {
    const header = Buffer.from(
      'H Product:Blackbox flight data recorder by Nicholas Sherlock\nH Craft name:Cinelog  20\nH Firmware revision:Betaflight 4.5.0\n',
      'latin1',
    );

    expect(craftNameFrom(header)).toBe('Cinelog  20');
    expect(craftNameFrom(Buffer.from('H Product:Blackbox\nH Craft name:\n', 'latin1'))).toBeNull();
    expect(craftNameFrom(Buffer.from([0x49, 0x00, 0xff]))).toBeNull();
  });
});

/**
 * Real logs, decoded by blackbox_decode and cut to the columns the parser
 * reads (see __fixtures__/README.md). Every figure was checked against a
 * separate reading of the same frames.
 */
describe('real blackbox logs', () => {
  const folder = join(__dirname, '__fixtures__', 'decoded');

  /** Every decoded log of one .bbl, in order: `air65-btfl_007.01.csv.gz`, `.02`, … */
  const decoded = (source: string): string[] =>
    readdirSync(folder)
      .filter((name) => name.startsWith(`${source}.`) && name.endsWith('.csv.gz'))
      .sort()
      .map((name) => gunzipSync(readFileSync(join(folder, name))).toString('utf8'));

  it('reads a Cinelog20 log: its sag under load and the charge its current adds up to', () => {
    const { flights } = parseBlackboxLogs(decoded('cinelog20-btfl_001'), 'Cinelog  20', 0);

    expect(flights).toHaveLength(1);

    const [flight] = flights;
    expect(flight.startedAt.getTime()).toBe(28_171);
    expect(flight).toMatchObject({
      timeRecorded: false,
      durationS: 14,
      sampleCount: 14_055,
      startVoltage: 15.93,
      minVoltage: 13.01,
      endVoltage: 15.59,
      maxCurrentA: 38.9,
      mahUsed: 17,
      avgThrottlePct: 32,
      maxThrottlePct: 72,
    });
  });

  it('joins an Air65 re-arm 1.3 s after its first log into one flight', () => {
    const logs = decoded('air65-btfl_007');
    const { flights, discarded } = parseBlackboxLogs(logs, 'AIR65 F', 0);

    expect(logs).toHaveLength(2);
    expect(discarded).toBe(0);
    expect(flights).toHaveLength(1);

    const [flight] = flights;
    expect(flight.startedAt.getTime()).toBe(11_758);
    expect(flight).toMatchObject({
      durationS: 37,
      sampleCount: 36_298,
      startVoltage: 4.09,
      minVoltage: 2.49,
      endVoltage: 2.51,
      maxCurrentA: 9.2,
      mahUsed: 29,
      avgThrottlePct: 37,
      maxThrottlePct: 59,
    });
  });
});

describe('blackboxOrigin', () => {
  it('places a file on its day, in the order the flash numbered it', () => {
    const day = Date.UTC(2026, 8, 13);

    expect(blackboxOrigin('2026-09-13', 'btfl_003.bbl')).toBe(day + 3 * 10 * 60_000);
    expect(blackboxOrigin('2026-09-13', 'LOGS/btfl_001.BBL')).toBe(day + 10 * 60_000);
    expect(blackboxOrigin('2026-09-13', 'flight.bbl')).toBe(day);
    // A day holds 144 slots; a later number shares the last rather than spilling into tomorrow.
    expect(blackboxOrigin('2026-09-13', 'btfl_900.bbl')).toBe(day + 143 * 10 * 60_000);
  });
});

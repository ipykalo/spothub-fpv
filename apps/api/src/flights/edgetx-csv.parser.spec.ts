import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  LogParseError,
  MIN_FLIGHT_MS,
  modelNameFrom,
  parseEdgeTxCsv,
} from './edgetx-csv.parser';

/** The header an ELRS receiver on a Betaflight quad produces, GPS included. */
const HEADER =
  'Date,Time,1RSS(dB),RQly(%),RxBt(V),Curr(A),Capa(mAh),FM,GPS,GSpd(kmh),Alt(m),Sats,Thr,TxBat(V)';

interface Row {
  /** Seconds after 14:00:00 on 2026-09-12. */
  readonly s: number;
  readonly v?: number;
  readonly a?: number;
  readonly mah?: number;
  readonly lq?: number;
  readonly fm?: string;
  readonly gps?: string;
  readonly kmh?: number;
  readonly alt?: number;
  readonly sats?: number;
}

function clock(seconds: number): string {
  const whole = Math.floor(seconds);
  const millis = Math.round((seconds - whole) * 1000);
  const hh = 14 + Math.floor(whole / 3600);
  const mm = Math.floor((whole % 3600) / 60);
  const ss = whole % 60;
  const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

  return `${pad(hh)}:${pad(mm)}:${pad(ss)}.${pad(millis, 3)}`;
}

function log(rows: readonly Row[]): string {
  const lines = rows.map((row) =>
    [
      '2026-09-12',
      clock(row.s),
      '-60',
      row.lq ?? 100,
      row.v ?? '',
      row.a ?? '',
      row.mah ?? '',
      row.fm ?? '',
      row.gps ?? '',
      row.kmh ?? '',
      row.alt ?? '',
      row.sats ?? '',
      '0',
      '7.9',
    ].join(','),
  );

  return [HEADER, ...lines].join('\n');
}

/** A flight of `seconds` seconds, one row a second, no GPS. */
function steadyFlight(from: number, seconds: number, mahFrom = 0): Row[] {
  return Array.from({ length: seconds + 1 }, (_, i) => ({
    s: from + i,
    v: 16.8 - i * 0.02,
    a: 10 + (i % 5),
    mah: mahFrom + i * 10,
    lq: 100 - (i % 3),
    fm: 'ACRO',
  }));
}

describe('parseEdgeTxCsv', () => {
  it('reads battery and link figures from a log with no GPS', () => {
    const rows = steadyFlight(0, 60);
    const { flights, discarded } = parseEdgeTxCsv(
      log(rows),
      'Nazgul-2026-09-12-140000.csv',
    );

    expect(discarded).toBe(0);
    expect(flights).toHaveLength(1);

    const [flight] = flights;
    expect(flight.durationS).toBe(60);
    expect(flight.sampleCount).toBe(61);
    expect(flight.startedAt.toISOString()).toBe('2026-09-12T14:00:00.000Z');
    expect(flight.startVoltage).toBe(16.8);
    expect(flight.endVoltage).toBe(15.6);
    expect(flight.minVoltage).toBe(15.6);
    expect(flight.mahUsed).toBe(600);
    expect(flight.maxCurrentA).toBe(14);
    expect(flight.minLinkQuality).toBe(98);
    expect(flight.hasGps).toBe(false);
    expect(flight.distanceM).toBeNull();
  });

  it('counts only armed rows when the flight mode says, so bench time is not flying', () => {
    const bench = Array.from({ length: 20 }, (_, i) => ({ s: i, v: 16.9, fm: 'ACRO*' }));
    const rows = [...bench, ...steadyFlight(20, 30)];

    const [flight] = parseEdgeTxCsv(log(rows), 'x.csv').flights;

    expect(flight.startedAt.toISOString()).toBe('2026-09-12T14:00:20.000Z');
    expect(flight.durationS).toBe(30);
    // The 16.9 V bench reading is not the start of the flight.
    expect(flight.startVoltage).toBe(16.8);
  });

  it('splits one file into two flights across a long pause', () => {
    const rows = [...steadyFlight(0, 40), ...steadyFlight(600, 40, 1000)];

    const { flights } = parseEdgeTxCsv(log(rows), 'x.csv');

    expect(flights).toHaveLength(2);
    expect(flights[1].startedAt.toISOString()).toBe('2026-09-12T14:10:00.000Z');
    // Capacity is cumulative since plug-in: each flight used the rise across it.
    expect(flights[0].mahUsed).toBe(400);
    expect(flights[1].mahUsed).toBe(400);
  });

  it('keeps a flight whole across a short disarm, like flipping out of a crash', () => {
    const rows = [
      ...steadyFlight(0, 30),
      ...Array.from({ length: 10 }, (_, i) => ({ s: 31 + i, v: 15.9, fm: 'ACRO*' })),
      ...steadyFlight(41, 30),
    ];

    expect(parseEdgeTxCsv(log(rows), 'x.csv').flights).toHaveLength(1);
  });

  it('drops stretches too short to be a flight, and says how many', () => {
    const tooShort = MIN_FLIGHT_MS / 1000 - 2;
    const rows = [...steadyFlight(0, tooShort), ...steadyFlight(300, 40)];

    const { flights, discarded } = parseEdgeTxCsv(log(rows), 'x.csv');

    expect(flights).toHaveLength(1);
    expect(discarded).toBe(1);
  });

  it('ignores zero voltage from before the telemetry link came up', () => {
    const rows = steadyFlight(0, 20).map((row, i) => (i < 3 ? { ...row, v: 0 } : row));

    const [flight] = parseEdgeTxCsv(log(rows), 'x.csv').flights;

    expect(flight.startVoltage).toBe(16.74);
    expect(flight.minVoltage).toBeGreaterThan(0);
  });

  it('measures the track when the quad carries GPS', () => {
    // 0.001° of latitude is about 111 m. Out 3 steps, back 3 steps.
    const lats = [50, 50.001, 50.002, 50.003, 50.002, 50.001, 50];
    const rows: Row[] = lats.map((lat, i) => ({
      s: i * 5,
      v: 16,
      fm: 'ACRO',
      gps: `${lat.toFixed(6)} 30.000000`,
      kmh: 40 + i,
      alt: 200 + i * 10,
      sats: 12,
    }));
    // Before the lock: a zero fix and a low-satellite fix, both ignored.
    rows.unshift({ s: -2, v: 16, fm: 'ACRO', gps: '0 0', sats: 0 });
    rows.splice(3, 0, { s: 7, v: 16, fm: 'ACRO', gps: '51.000000 31.000000', sats: 2 });

    const [flight] = parseEdgeTxCsv(log(rows), 'x.csv').flights;

    expect(flight.hasGps).toBe(true);
    expect(flight.distanceM).toBeGreaterThan(660);
    expect(flight.distanceM).toBeLessThan(670);
    expect(flight.maxHomeDistanceM).toBeGreaterThan(330);
    expect(flight.maxHomeDistanceM).toBeLessThan(336);
    // Relative to take-off, not above sea level.
    expect(flight.maxAltitudeM).toBe(60);
    expect(flight.maxSpeedKmh).toBe(46);
  });

  it('does not count a GPS glitch as distance flown', () => {
    const rows: Row[] = [
      { s: 0, fm: 'ACRO', gps: '50.000000 30.000000', sats: 10 },
      { s: 1, fm: 'ACRO', gps: '50.100000 30.000000', sats: 10 },
      { s: 12, fm: 'ACRO', gps: '50.000100 30.000000', sats: 10 },
    ];

    const [flight] = parseEdgeTxCsv(log(rows), 'x.csv').flights;

    // The 11 km jump in one second is thrown away; the real ~11 m stays.
    expect(flight.distanceM).toBeLessThan(15);
  });

  it('copes with CRLF line endings, a byte-order mark and short fractions', () => {
    const text =
      `${String.fromCharCode(0xfeff)}${HEADER}\r\n` +
      '2026-09-12,14:00:00.4,-60,100,16.8,10,0,ACRO,,,,,0,7.9\r\n' +
      '2026-09-12,14:00:20.40,-60,100,16.2,12,200,ACRO,,,,,0,7.9\r\n';

    const [flight] = parseEdgeTxCsv(text, 'x.csv').flights;

    expect(flight.startedAt.toISOString()).toBe('2026-09-12T14:00:00.400Z');
    expect(flight.durationS).toBe(20);
  });

  it('refuses a file that is not an EdgeTX log', () => {
    expect(() => parseEdgeTxCsv('a,b,c\n1,2,3', 'x.csv')).toThrow(LogParseError);
    expect(() => parseEdgeTxCsv('', 'x.csv')).toThrow(LogParseError);
  });
});

describe('modelNameFrom', () => {
  it('reads the model from the names EdgeTX gives its logs', () => {
    expect(modelNameFrom('Nazgul5-2026-09-12-140512.csv')).toBe('Nazgul5');
    expect(modelNameFrom('Cine-Log 20-2026-09-12.csv')).toBe('Cine-Log 20');
    expect(modelNameFrom('LOGS/Mob7-2026-01-02-090000.CSV')).toBe('Mob7');
    expect(modelNameFrom('whatever.csv')).toBe('whatever');
  });
});

/**
 * Every real log in `__fixtures__/edgetx/` must read cleanly. Nothing here
 * knows what each one contains, so the checks are the invariants any real
 * flight has to satisfy.
 */
describe('real EdgeTX logs', () => {
  const folder = join(__dirname, '__fixtures__', 'edgetx');
  const files = readdirSync(folder).filter((name) => name.toLowerCase().endsWith('.csv'));

  it.skipIf(files.length > 0)('has none yet — add some from the radio', () => {
    expect(files).toHaveLength(0);
  });

  for (const name of files) {
    it(`reads ${name}`, () => {
      const { flights, rowCount } = parseEdgeTxCsv(
        readFileSync(join(folder, name), 'utf8'),
        name,
      );

      expect(rowCount).toBeGreaterThan(0);

      for (const flight of flights) {
        expect(flight.endedAt.getTime()).toBeGreaterThan(flight.startedAt.getTime());
        expect(flight.durationS).toBeGreaterThanOrEqual(MIN_FLIGHT_MS / 1000);

        for (const volts of [flight.startVoltage, flight.minVoltage, flight.endVoltage]) {
          if (volts !== null) {
            expect(volts).toBeGreaterThan(0);
            expect(volts).toBeLessThan(60);
          }
        }

        if (flight.minLinkQuality !== null) {
          expect(flight.minLinkQuality).toBeGreaterThanOrEqual(0);
          expect(flight.minLinkQuality).toBeLessThanOrEqual(100);
        }
      }
    });
  }
});

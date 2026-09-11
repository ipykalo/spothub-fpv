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

  it('reads a flight mode in quotes, the way EdgeTX writes text', () => {
    const bench = Array.from({ length: 20 }, (_, i) => ({
      s: i,
      v: 16.9,
      fm: '"ACRO*"',
    }));
    const flying = steadyFlight(20, 30).map((row) => ({ ...row, fm: '"ACRO"' }));

    const [flight] = parseEdgeTxCsv(log([...bench, ...flying]), 'x.csv').flights;

    expect(flight.startedAt.toISOString()).toBe('2026-09-12T14:00:20.000Z');
    expect(flight.durationS).toBe(30);
  });
});

/**
 * A real log's header: an Air65 whoop on ExpressLRS whose flight controller
 * sends no telemetry. FM is `""` and the battery columns read zero, while the
 * receiver's link statistics and the radio's own inputs are all there.
 */
const AIR65_HEADER = [
  'Date,Time,Ptch(rad),Roll(rad),Yaw(rad),FM,RxBt(V),Curr(A),Capa(mAh),Bat%(%)',
  '1RSS(dB),2RSS(dB),RQly(%),RSNR(dB),ANT,RFMD,TPWR(mW),TRSS(dB),TQly(%),TSNR(dB)',
  'Rud,Ele,Thr,Ail,SA,SB,SC,SD,SE,SF,LSW',
  Array.from({ length: 32 }, (_, i) => `CH${String(i + 1)}(us)`).join(','),
  'TxBat(V)',
].join(',');

interface RadioRow {
  /** Seconds after 14:00:00, on the 2000-01-01 of a radio whose clock is unset. */
  readonly s: number;
  /** The arm switch: SA, driving channel 5. */
  readonly armed: boolean;
  readonly thr?: number;
  readonly rssi?: number;
  readonly snr?: number;
  readonly downlink?: number;
  readonly power?: number;
  readonly radioV?: number;
}

function air65Log(rows: readonly RadioRow[]): string {
  const names = AIR65_HEADER.split(',');
  const lines = rows.map((row) => {
    const cells: Partial<Record<string, string | number>> = {
      Date: '2000-01-01',
      Time: clock(row.s),
      FM: '""',
      'RxBt(V)': '0.0',
      'Curr(A)': '0.0',
      '1RSS(dB)': row.rssi ?? -60,
      'RQly(%)': 100,
      'RSNR(dB)': row.snr ?? 10,
      'TPWR(mW)': row.power ?? 25,
      'TQly(%)': row.downlink ?? 100,
      Thr: row.thr ?? -1024,
      SA: row.armed ? 1 : -1,
      LSW: '0x0000000000000000',
      'CH5(us)': row.armed ? 2012 : 988,
      'TxBat(V)': row.radioV ?? 7.7,
    };

    return names
      .map((name) => cells[name] ?? (name.startsWith('CH') ? 1500 : 0))
      .join(',');
  });

  return [AIR65_HEADER, ...lines].join('\n');
}

/** One row a second for `length` seconds, the arm switch on from `from` to `to`. */
function armedBetween(from: number, to: number, length: number): RadioRow[] {
  return Array.from({ length }, (_, s) => ({ s, armed: s >= from && s <= to }));
}

describe('a log from a quad that sends no telemetry', () => {
  it('times the flight by the arm switch when there is no flight mode', () => {
    const [flight] = parseEdgeTxCsv(
      air65Log(armedBetween(10, 100, 121)),
      'Air65-2000-01-01-000105.csv',
    ).flights;

    expect(flight.startedAt.toISOString()).toBe('2000-01-01T14:00:10.000Z');
    expect(flight.durationS).toBe(90);
  });

  it('counts the whole log when the arm switch never moves', () => {
    const [flight] = parseEdgeTxCsv(air65Log(armedBetween(0, 30, 31)), 'x.csv').flights;

    expect(flight.durationS).toBe(30);
  });

  it('reports no battery figures, rather than zeros that read as measurements', () => {
    const [flight] = parseEdgeTxCsv(
      air65Log(armedBetween(10, 100, 121)),
      'x.csv',
    ).flights;

    expect(flight.startVoltage).toBeNull();
    expect(flight.minVoltage).toBeNull();
    expect(flight.endVoltage).toBeNull();
    expect(flight.mahUsed).toBeNull();
    expect(flight.maxCurrentA).toBeNull();
  });

  it('reads the link, the throttle and the radio battery', () => {
    const extra: Partial<Record<number, Partial<RadioRow>>> = {
      50: { thr: 1024, rssi: -95, snr: -2, downlink: 60, power: 500, radioV: 7.5 },
      // After landing the pack comes out and the telemetry link drops: that is
      // not part of the flight.
      110: { downlink: 0, radioV: 7.4 },
    };
    const rows = armedBetween(10, 100, 121).map((row) => ({ ...row, ...extra[row.s] }));

    const [flight] = parseEdgeTxCsv(air65Log(rows), 'x.csv').flights;

    expect(flight.minLinkQuality).toBe(100);
    expect(flight.minRssiDbm).toBe(-95);
    expect(flight.minSnrDb).toBe(-2);
    expect(flight.minDownlinkQuality).toBe(60);
    expect(flight.maxTxPowerMw).toBe(500);
    expect(flight.maxThrottlePct).toBe(100);
    // 90 of the 91 armed rows at idle and one at full: about 1 % on average.
    expect(flight.avgThrottlePct).toBe(1);
    expect(flight.minRadioVoltage).toBe(7.5);
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

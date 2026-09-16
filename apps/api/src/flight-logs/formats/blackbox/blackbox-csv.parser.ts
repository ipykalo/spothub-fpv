/**
 * Betaflight blackbox logs, read into flights.
 *
 * Read from the CSV that Betaflight's own blackbox_decode writes — one CSV per
 * log in a file — rather than from the binary, whose encoding changes between
 * firmware releases and which Betaflight's decoder keeps up with.
 *
 * A flight controller logs from arming to disarming, so one .bbl from one
 * power-on holds one log per arm: a pack's flying, cut up by crashes and
 * re-arms. Logs less than SPLIT_GAP_MS apart join into one flight, the way the
 * radio's rows do.
 *
 * A blackbox records no date and no time of day, only seconds since power-on.
 * So the caller places the file: `origin` is the moment its power-on is taken
 * as, every flight lands at origin plus its own offset, and `timeRecorded` is
 * false.
 *
 * Pure: text in, flights out.
 */

import {
  LogParseError,
  MIN_FLIGHT_MS,
  type ParsedFlight,
  type ParsedLog,
  SPLIT_GAP_MS,
  maxOf,
  meanOf,
  minOf,
  round,
  values,
} from '../parsed-log';

/** Frames further apart than this are a gap in logging, not flight to count current over. */
const MAX_FRAME_GAP_S = 0.5;

/** A voltage at or below this is no reading, not an empty pack. */
const MIN_REAL_VOLTAGE = 0.5;

/** rcCommand[3] runs from 1000, throttle off, to 2000, full. */
const THROTTLE_OFF = 1000;
const THROTTLE_SPAN = 1000;

/** Blackbox files from one day sit this far apart, in file-number order. */
const FILE_SLOT_MS = 10 * 60_000;

/** The last slot of a day; a later file number shares it. */
const LAST_SLOT = 143;

/** Headers are ASCII at the start of each log; the frames after them are binary. */
const HEADER_BYTES = 64 * 1024;

interface Frame {
  /** Seconds since the flight controller powered on. */
  readonly t: number;
  /** Which log of the file it came from, so current is never counted across a disarm. */
  readonly log: number;
  readonly voltage: number | null;
  readonly current: number | null;
  readonly throttlePct: number | null;
}

interface Columns {
  readonly time: number;
  readonly timeScale: number;
  readonly voltage: number;
  readonly voltageScale: number;
  readonly current: number;
  readonly currentScale: number;
  readonly throttle: number;
}

export function parseBlackboxLogs(
  logs: readonly string[],
  craftName: string | null,
  origin: number,
): ParsedLog {
  const frames: Frame[] = [];
  let readable = false;

  for (const [log, csv] of logs.entries()) {
    const lines = csv.split(/\r?\n/);
    const columns = readHeader(lines[0]);

    // An empty log — armed and disarmed with nothing between — has no header.
    if (columns === null) {
      continue;
    }

    readable = true;

    for (let index = 1; index < lines.length; index += 1) {
      const frame = readFrame(lines[index], columns, log);

      if (frame) {
        frames.push(frame);
      }
    }
  }

  if (!readable) {
    throw new LogParseError('Not a blackbox log: the decoder found no frame times in it');
  }

  frames.sort((a, b) => a.t - b.t);

  const runs = split(frames);
  const flights = runs.filter(
    (run) => run.length >= 2 && spanS(run) * 1000 >= MIN_FLIGHT_MS,
  );

  return {
    modelName: craftName,
    flights: flights.map((run) => summarise(run, origin)),
    discarded: runs.length - flights.length,
    rowCount: frames.length,
  };
}

/** The craft name a flight controller writes into each log's header, or null. */
export function craftNameFrom(bytes: Uint8Array): string | null {
  const text = Buffer.from(
    bytes.buffer,
    bytes.byteOffset,
    Math.min(bytes.length, HEADER_BYTES),
  ).toString('latin1');
  const name = /^H Craft name:(.*)$/m.exec(text)?.[1]?.trim();

  return name !== undefined && name.length > 0 ? name : null;
}

/**
 * Where a blackbox file's power-on is placed: the day it was flown, at UTC
 * midnight, plus a slot per file number. The Betaflight flash names its logs
 * `btfl_001.bbl`, `btfl_002.bbl` in the order they were recorded, so the slots
 * keep a day's packs in flying order. The time of day this gives means
 * nothing, which is why these flights are stored with `timeRecorded` false.
 */
export function blackboxOrigin(flownOn: string, fileName: string): number {
  const [year, month, day] = flownOn.split('-').map(Number);
  const number = /btfl_(\d+)/i.exec(fileName)?.[1];
  const slot = number === undefined ? 0 : Math.min(Number(number), LAST_SLOT);

  return Date.UTC(year, month - 1, day) + slot * FILE_SLOT_MS;
}

/** Where each figure sits, matched by name without its unit — `vbatLatest (V)`. */
function readHeader(header: string): Columns | null {
  const names = header.split(',').map((raw) => {
    const name = raw.trim();
    return {
      base: name.replace(/\s*\([^)]*\)$/, ''),
      unit: /\(([^)]*)\)$/.exec(name)?.[1] ?? null,
    };
  });
  const find = (base: string): number => names.findIndex((name) => name.base === base);

  const time = find('time');

  if (time === -1) {
    return null;
  }

  const voltage = find('vbatLatest');
  const current = find('amperageLatest');

  return {
    time,
    // The decoder writes microseconds unless asked for seconds.
    timeScale: names[time].unit === 's' ? 1 : 1e-6,
    voltage,
    voltageScale: voltage !== -1 && names[voltage].unit === 'mV' ? 0.001 : 1,
    current,
    currentScale: current !== -1 && names[current].unit === 'mA' ? 0.001 : 1,
    throttle: find('rcCommand[3]'),
  };
}

function readFrame(line: string, columns: Columns, log: number): Frame | null {
  if (line.trim().length === 0) {
    return null;
  }

  const cells = line.split(',');
  const time = numeric(cells[columns.time]);

  if (time === null) {
    return null;
  }

  const voltage = scaled(cells, columns.voltage, columns.voltageScale);
  const throttle = columns.throttle === -1 ? null : numeric(cells[columns.throttle]);

  return {
    t: time * columns.timeScale,
    log,
    voltage: voltage !== null && voltage > MIN_REAL_VOLTAGE ? voltage : null,
    current: scaled(cells, columns.current, columns.currentScale),
    throttlePct:
      throttle === null
        ? null
        : Math.min(100, Math.max(0, ((throttle - THROTTLE_OFF) / THROTTLE_SPAN) * 100)),
  };
}

function numeric(cell: string | undefined): number | null {
  const text = cell?.trim();

  if (text === undefined || text.length === 0) {
    return null;
  }

  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function scaled(cells: readonly string[], index: number, scale: number): number | null {
  if (index === -1) {
    return null;
  }

  const value = numeric(cells[index]);
  return value === null ? null : value * scale;
}

function split(frames: readonly Frame[]): Frame[][] {
  const runs: Frame[][] = [];
  let current: Frame[] = [];

  for (const frame of frames) {
    const previous = current.at(-1);

    if (previous && (frame.t - previous.t) * 1000 > SPLIT_GAP_MS) {
      runs.push(current);
      current = [];
    }

    current.push(frame);
  }

  if (current.length > 0) {
    runs.push(current);
  }

  return runs;
}

function spanS(run: readonly Frame[]): number {
  const first = run.at(0);
  const last = run.at(-1);
  return first && last ? last.t - first.t : 0;
}

function summarise(run: readonly Frame[], origin: number): ParsedFlight {
  const first = run[0];
  const last = run[run.length - 1];

  const voltages = values(run, (frame) => frame.voltage);
  const currents = values(run, (frame) => frame.current).filter((amps) => amps >= 0);
  const throttle = values(run, (frame) => frame.throttlePct);

  // A current sensor that reads nothing but zero has nothing behind it.
  const peakCurrent = maxOf(currents) ?? 0;

  return {
    startedAt: new Date(origin + Math.round(first.t * 1000)),
    endedAt: new Date(origin + Math.round(last.t * 1000)),
    timeRecorded: false,
    durationS: Math.round(last.t - first.t),
    sampleCount: run.length,
    // Voltage straight off the flight controller's ADC, a thousand times a
    // second: the minimum is the sag under the hardest punch, which the
    // radio's few telemetry readings a second smooth away.
    startVoltage: round(voltages.at(0), 2),
    minVoltage: round(minOf(voltages), 2),
    endVoltage: round(voltages.at(-1), 2),
    mahUsed: peakCurrent > 0 ? Math.round(chargeMah(run)) : null,
    maxCurrentA: peakCurrent > 0 ? round(peakCurrent, 1) : null,
    // The link, the radio and the track are the radio's to log, not the flight controller's.
    minLinkQuality: null,
    minRssiDbm: null,
    minSnrDb: null,
    minDownlinkQuality: null,
    maxTxPowerMw: null,
    avgThrottlePct: round(meanOf(throttle), 0),
    maxThrottlePct: round(maxOf(throttle), 0),
    minRadioVoltage: null,
    hasGps: false,
    distanceM: null,
    maxAltitudeM: null,
    maxSpeedKmh: null,
    maxHomeDistanceM: null,
  };
}

/**
 * Charge drawn, in mAh: current over time, frame to frame. Counted from the
 * frames themselves rather than the decoder's `energyCumulative`, which on
 * real logs carried on across logs and read double within one. Never across
 * the gap between two logs, when the quad was disarmed, and never below zero,
 * which is the sensor's offset rather than charge flowing back in.
 */
function chargeMah(run: readonly Frame[]): number {
  let ampSeconds = 0;

  for (let index = 1; index < run.length; index += 1) {
    const from = run[index - 1];
    const to = run[index];
    const seconds = to.t - from.t;

    if (
      from.log === to.log &&
      from.current !== null &&
      seconds > 0 &&
      seconds <= MAX_FRAME_GAP_S
    ) {
      ampSeconds += Math.max(from.current, 0) * seconds;
    }
  }

  return ampSeconds / 3.6;
}

/**
 * EdgeTX telemetry logs, read into flights.
 *
 * The radio writes one CSV per logging session: a header naming every sensor
 * it discovered (`RxBt(V)`, `Capa(mAh)`, `GPS`, …), then a row per interval.
 * Which columns exist depends on the receiver and the flight controller, so
 * every one is optional except the clock. That is also why this works with no
 * GPS at all — voltage, current and link quality are what a freestyle quad
 * without a GPS module still reports, and they are what battery health needs.
 *
 * Pure: text in, flights out. No Nest, no storage, no shared imports, so it
 * can be tested against real SD-card logs in isolation.
 */

/** A pause in the rows longer than this ends one flight and starts another. */
export const SPLIT_GAP_MS = 30_000;

/** Shorter than this is a radio switched on or an arm check, not a flight. */
export const MIN_FLIGHT_MS = 10_000;

/** Consecutive GPS fixes implying more than this are a glitch, not movement. */
const MAX_PLAUSIBLE_SPEED_MS = 100;

/** Fewer satellites than this and a position is not worth trusting. */
const MIN_SATELLITES = 4;

/** A voltage at or below this means "no telemetry yet", not an empty pack. */
const MIN_REAL_VOLTAGE = 0.5;

export interface ParsedFlight {
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly durationS: number;
  readonly sampleCount: number;
  readonly startVoltage: number | null;
  readonly minVoltage: number | null;
  readonly endVoltage: number | null;
  readonly mahUsed: number | null;
  readonly maxCurrentA: number | null;
  readonly minLinkQuality: number | null;
  readonly hasGps: boolean;
  readonly distanceM: number | null;
  readonly maxAltitudeM: number | null;
  readonly maxSpeedKmh: number | null;
  readonly maxHomeDistanceM: number | null;
}

export interface ParsedLog {
  /** The radio model the log was recorded under, from the file name. */
  readonly modelName: string | null;
  readonly flights: readonly ParsedFlight[];
  /** Stretches too short to be a flight, dropped rather than stored. */
  readonly discarded: number;
  /** Rows that carried a readable timestamp. */
  readonly rowCount: number;
}

/** The file is not an EdgeTX log at all, as opposed to one with no flights. */
export class LogParseError extends Error {}

interface Sample {
  readonly t: number;
  readonly voltage: number | null;
  readonly current: number | null;
  readonly capacity: number | null;
  readonly linkQuality: number | null;
  /** From the flight-mode string; null when the log does not say. */
  readonly armed: boolean | null;
  readonly lat: number | null;
  readonly lon: number | null;
  readonly altitude: number | null;
  readonly speedKmh: number | null;
  readonly satellites: number | null;
}

interface Columns {
  readonly date: number;
  readonly time: number;
  readonly voltage: number;
  readonly current: number;
  readonly capacity: number;
  readonly linkQuality: number;
  readonly flightMode: number;
  readonly gps: number;
  readonly altitude: number;
  readonly speed: number;
  readonly satellites: number;
}

export function parseEdgeTxCsv(text: string, fileName: string): ParsedLog {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const header = lines.at(0);

  if (header === undefined) {
    throw new LogParseError('The file is empty');
  }

  const columns = readHeader(header);
  const samples: Sample[] = [];

  for (const line of lines.slice(1)) {
    const sample = readRow(line.split(','), columns);

    if (sample) {
      samples.push(sample);
    }
  }

  samples.sort((a, b) => a.t - b.t);

  const { segments, discarded } = segment(samples);

  return {
    modelName: modelNameFrom(fileName),
    flights: segments.map(summarise),
    discarded,
    rowCount: samples.length,
  };
}

/**
 * Where each sensor sits. Headers carry the unit in brackets — `RxBt(V)` —
 * and are matched without it, case-insensitively, so a renamed unit or an
 * older EdgeTX spelling still lines up.
 */
function readHeader(header: string): Columns {
  // Some editors and exports open a file with a byte-order mark.
  const byteOrderMark = String.fromCharCode(0xfeff);
  const names = (header.startsWith(byteOrderMark) ? header.slice(1) : header)
    .split(',')
    .map((name) =>
      name
        .replace(/\(.*\)\s*$/, '')
        .trim()
        .toLowerCase(),
    );

  const find = (...candidates: string[]): number => {
    for (const candidate of candidates) {
      const index = names.indexOf(candidate);

      if (index !== -1) {
        return index;
      }
    }

    return -1;
  };

  const columns: Columns = {
    date: find('date'),
    time: find('time'),
    // CRSF reports the flight pack as RxBt; FrSky Smart Port as VFAS.
    voltage: find('rxbt', 'vfas'),
    current: find('curr'),
    capacity: find('capa'),
    linkQuality: find('rqly'),
    flightMode: find('fm'),
    gps: find('gps'),
    altitude: find('alt', 'galt'),
    speed: find('gspd'),
    satellites: find('sats'),
  };

  if (columns.date === -1 || columns.time === -1) {
    throw new LogParseError('Not an EdgeTX log: there is no Date and Time column');
  }

  return columns;
}

function readRow(cells: readonly string[], columns: Columns): Sample | null {
  const t = timestamp(cells[columns.date], cells[columns.time]);

  if (t === null) {
    return null;
  }

  const [lat, lon] = position(cell(cells, columns.gps));

  return {
    t,
    voltage: numeric(cell(cells, columns.voltage)),
    current: numeric(cell(cells, columns.current)),
    capacity: numeric(cell(cells, columns.capacity)),
    linkQuality: numeric(cell(cells, columns.linkQuality)),
    armed: armedFrom(cell(cells, columns.flightMode)),
    lat,
    lon,
    altitude: numeric(cell(cells, columns.altitude)),
    speedKmh: numeric(cell(cells, columns.speed)),
    satellites: numeric(cell(cells, columns.satellites)),
  };
}

function cell(cells: readonly string[], index: number): string | undefined {
  return index === -1 ? undefined : cells[index]?.trim();
}

/**
 * The radio's wall clock, taken as though it were UTC.
 *
 * The radio records no time zone. Reading these as local time on the server
 * would shift every flight by the server's offset; reading them as UTC and
 * rendering them in UTC shows exactly what the radio's clock said.
 */
function timestamp(date: string | undefined, time: string | undefined): number | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date?.trim() ?? '');
  const clock = /^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(time?.trim() ?? '');

  if (!day || !clock) {
    return null;
  }

  const [, year, month, dayOfMonth] = day.map(Number);
  const [, hours, minutes, seconds] = clock.map(Number);
  // A fraction of a second, whatever its number of digits: ".4" is 400 ms.
  const millis = clock[4] ? Math.round(Number(`0.${clock[4]}`) * 1000) : 0;

  const value = Date.UTC(year, month - 1, dayOfMonth, hours, minutes, seconds, millis);
  return Number.isFinite(value) ? value : null;
}

function numeric(value: string | undefined): number | null {
  if (value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** EdgeTX writes a fix as one cell, `lat lon`, space-separated. */
function position(value: string | undefined): [number | null, number | null] {
  const parts = value?.split(/\s+/).map(Number) ?? [];

  if (parts.length < 2) {
    return [null, null];
  }

  const [lat, lon] = parts;

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
    return [null, null];
  }

  return [lat, lon];
}

/**
 * Betaflight appends `*` to its flight mode while disarmed — `ACRO*` on the
 * bench, `ACRO` in the air. Other firmware may say nothing, hence the null.
 */
function armedFrom(flightMode: string | undefined): boolean | null {
  if (!flightMode) {
    return null;
  }

  return !flightMode.endsWith('*');
}

/**
 * Splits samples into flights.
 *
 * When the log says when the quad was armed, only armed rows count, so a
 * minute on the bench before take-off does not pad the flight. A pause longer
 * than `SPLIT_GAP_MS` — logging stopped, or a long disarm — ends one flight;
 * a short disarm, like flipping out of a crash, does not.
 */
function segment(samples: readonly Sample[]): {
  segments: Sample[][];
  discarded: number;
} {
  const knowsArming = samples.some((sample) => sample.armed === true);
  const flying = knowsArming
    ? samples.filter((sample) => sample.armed === true)
    : samples;

  const runs: Sample[][] = [];
  let current: Sample[] = [];

  for (const sample of flying) {
    const previous = current.at(-1);

    if (previous && sample.t - previous.t > SPLIT_GAP_MS) {
      runs.push(current);
      current = [];
    }

    current.push(sample);
  }

  if (current.length > 0) {
    runs.push(current);
  }

  const segments = runs.filter((run) => spanMs(run) >= MIN_FLIGHT_MS && run.length >= 2);

  return { segments, discarded: runs.length - segments.length };
}

function spanMs(run: readonly Sample[]): number {
  const first = run.at(0);
  const last = run.at(-1);
  return first && last ? last.t - first.t : 0;
}

function summarise(run: readonly Sample[]): ParsedFlight {
  const first = run[0];
  const last = run[run.length - 1];

  const voltages = values(run, (sample) => sample.voltage).filter(
    (voltage) => voltage > MIN_REAL_VOLTAGE,
  );
  const capacities = values(run, (sample) => sample.capacity).filter((mah) => mah >= 0);
  const currents = values(run, (sample) => sample.current).filter((amps) => amps >= 0);
  const links = values(run, (sample) => sample.linkQuality);

  const track = gpsSummary(run);

  return {
    startedAt: new Date(first.t),
    endedAt: new Date(last.t),
    durationS: Math.round((last.t - first.t) / 1000),
    sampleCount: run.length,
    startVoltage: round(voltages.at(0), 2),
    minVoltage: round(minOf(voltages), 2),
    endVoltage: round(voltages.at(-1), 2),
    // Capacity is cumulative since the pack was plugged in, so what this
    // flight used is the rise across it, not the last value.
    mahUsed:
      capacities.length > 0
        ? Math.round((maxOf(capacities) ?? 0) - (minOf(capacities) ?? 0))
        : null,
    maxCurrentA: round(maxOf(currents), 1),
    minLinkQuality: links.length > 0 ? Math.round(minOf(links) ?? 0) : null,
    ...track,
  };
}

interface Fix {
  readonly t: number;
  readonly lat: number;
  readonly lon: number;
  readonly altitude: number | null;
}

function gpsSummary(
  run: readonly Sample[],
): Pick<
  ParsedFlight,
  'hasGps' | 'distanceM' | 'maxAltitudeM' | 'maxSpeedKmh' | 'maxHomeDistanceM'
> {
  const fixes: Fix[] = [];

  for (const sample of run) {
    if (
      sample.lat !== null &&
      sample.lon !== null &&
      (sample.satellites === null || sample.satellites >= MIN_SATELLITES)
    ) {
      fixes.push({
        t: sample.t,
        lat: sample.lat,
        lon: sample.lon,
        altitude: sample.altitude,
      });
    }
  }

  const home = fixes.at(0);

  if (!home || fixes.length < 2) {
    return {
      hasGps: false,
      distanceM: null,
      maxAltitudeM: null,
      maxSpeedKmh: null,
      maxHomeDistanceM: null,
    };
  }

  let distance = 0;
  let farthest = 0;

  for (let index = 1; index < fixes.length; index += 1) {
    const from = fixes[index - 1];
    const to = fixes[index];
    const step = haversineM(from, to);
    const seconds = Math.max((to.t - from.t) / 1000, 0.001);

    // A fix that jumps faster than any quad flies is the receiver guessing.
    if (step / seconds <= MAX_PLAUSIBLE_SPEED_MS) {
      distance += step;
    }

    farthest = Math.max(farthest, haversineM(home, to));
  }

  const altitudes = fixes
    .map((fix) => fix.altitude)
    .filter((altitude): altitude is number => altitude !== null);
  const speeds = values(run, (sample) => sample.speedKmh);

  return {
    hasGps: true,
    distanceM: Math.round(distance),
    // Relative to where it took off: GPS altitude is above sea level, and
    // "flew 480 m up" is not what anyone means.
    maxAltitudeM:
      home.altitude !== null && altitudes.length > 0
        ? round((maxOf(altitudes) ?? home.altitude) - home.altitude, 1)
        : null,
    maxSpeedKmh: round(maxOf(speeds), 1),
    maxHomeDistanceM: Math.round(farthest),
  };
}

/** Great-circle distance in metres. Plenty accurate at the scale of a field. */
function haversineM(a: Fix, b: Fix): number {
  const radius = 6_371_000;
  const toRad = (degrees: number): number => (degrees * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;

  return 2 * radius * Math.asin(Math.sqrt(h));
}

function values(
  run: readonly Sample[],
  pick: (sample: Sample) => number | null,
): number[] {
  const result: number[] = [];

  for (const sample of run) {
    const value = pick(sample);

    if (value !== null) {
      result.push(value);
    }
  }

  return result;
}

function minOf(list: readonly number[]): number | undefined {
  return list.length > 0 ? Math.min(...list) : undefined;
}

function maxOf(list: readonly number[]): number | undefined {
  return list.length > 0 ? Math.max(...list) : undefined;
}

function round(value: number | undefined, digits: number): number | null {
  if (value === undefined) {
    return null;
  }

  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * The model name, from the file name EdgeTX gives a log:
 * `<model>-<YYYY-MM-DD>-<HHMMSS>.csv`, or `<model>-<YYYY-MM-DD>.csv` from
 * older firmware that appended a whole day to one file.
 */
export function modelNameFrom(fileName: string): string | null {
  const base = fileName.split(/[\\/]/).at(-1) ?? fileName;
  const match = /^(.+?)-\d{4}-\d{2}-\d{2}(?:-\d{6})?\.csv$/i.exec(base);
  const name = (match?.[1] ?? base.replace(/\.csv$/i, '')).trim();

  return name.length > 0 ? name : null;
}

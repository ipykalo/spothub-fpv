/**
 * Reads a GPX file into GPS tracks, one per stretch of flying.
 *
 * A GPX file — from a phone, goggles or a GPS logger — carries positions,
 * heights and true UTC times, and nothing else: no battery, no link, no
 * sticks. So what it gives is the track figures alone, and the import adds
 * each track to the radio-log flight it overlaps. Pure, and dependency-free:
 * GPX is simple enough that a handful of patterns read every exporter's
 * output without an XML parser.
 */

import { type Fix, summariseTrack } from '../gps-track';
import {
  LogParseError,
  MIN_FLIGHT_MS,
  type ParsedFlight,
  type ParsedLog,
  SPLIT_GAP_MS,
} from '../parsed-log';

/** A track or route point, self-closing or with children. */
const POINT = /<(trkpt|rtept)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g;

export function parseGpx(text: string): ParsedLog {
  if (!/<gpx\b/i.test(text)) {
    throw new LogParseError('Not a GPX file: there is no <gpx> element');
  }

  const fixes: Fix[] = [];

  for (const match of text.matchAll(POINT)) {
    const attributes = match[2];
    // A self-closing point has no children at all.
    const children = match.at(3) ?? '';
    const lat = Number(attribute(attributes, 'lat'));
    const lon = Number(attribute(attributes, 'lon'));
    const t = Date.parse(child(children, 'time') ?? '');

    // Without a time a point cannot be placed in a flight, so it is dropped.
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Number.isNaN(t)) {
      continue;
    }

    const ele = Number(child(children, 'ele') ?? Number.NaN);
    fixes.push({ t, lat, lon, altitude: Number.isFinite(ele) ? ele : null });
  }

  if (fixes.length === 0) {
    throw new LogParseError('That GPX file has no track points with a time');
  }

  fixes.sort((a, b) => a.t - b.t);

  const runs = split(fixes);
  const flights = runs.filter((run) => span(run) >= MIN_FLIGHT_MS).map(toFlight);

  return {
    modelName: trackName(text),
    flights,
    discarded: runs.length - flights.length,
    rowCount: fixes.length,
    tracksOnly: true,
  };
}

/** A pause longer than any flight has ends one track and starts another. */
function split(fixes: readonly Fix[]): Fix[][] {
  const runs: Fix[][] = [];
  let current: Fix[] = [];

  for (const fix of fixes) {
    const previous = current.at(-1);

    if (previous && fix.t - previous.t > SPLIT_GAP_MS) {
      runs.push(current);
      current = [];
    }

    current.push(fix);
  }

  runs.push(current);
  return runs;
}

function span(run: readonly Fix[]): number {
  return run.length === 0 ? 0 : run[run.length - 1].t - run[0].t;
}

function toFlight(run: readonly Fix[]): ParsedFlight {
  const first = run[0];
  const last = run[run.length - 1];

  return {
    startedAt: new Date(first.t),
    endedAt: new Date(last.t),
    // GPS time is true UTC, so a GPX track always records its time of day.
    timeRecorded: true,
    durationS: Math.round((last.t - first.t) / 1000),
    sampleCount: run.length,
    startVoltage: null,
    minVoltage: null,
    endVoltage: null,
    mahUsed: null,
    maxCurrentA: null,
    minLinkQuality: null,
    minRssiDbm: null,
    minSnrDb: null,
    minDownlinkQuality: null,
    maxTxPowerMw: null,
    avgThrottlePct: null,
    maxThrottlePct: null,
    minRadioVoltage: null,
    ...summariseTrack(run),
  };
}

/**
 * The track's own name, which a logger or app sets to the craft or the
 * activity. The file's metadata name is left alone: it is usually a title
 * ("Morning flight"), not a quad.
 */
function trackName(text: string): string | null {
  const name = /<trk\b[^>]*>[\s\S]*?<name>([^<]*)<\/name>/.exec(text)?.[1];
  const decoded = name === undefined ? '' : unescape(name).trim();

  return decoded.length > 0 ? decoded : null;
}

function attribute(attributes: string, name: string): string | undefined {
  return new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`).exec(attributes)?.[1];
}

function child(children: string, name: string): string | undefined {
  return new RegExp(`<${name}\\b[^>]*>([^<]*)</${name}>`).exec(children)?.[1]?.trim();
}

function unescape(text: string): string {
  return text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

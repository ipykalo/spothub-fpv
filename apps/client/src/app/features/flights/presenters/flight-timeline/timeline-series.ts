/**
 * One flight's log, turned into the traces a chart draws.
 *
 * Pure: points in, paths and ticks out, with no Angular and no DOM, so the
 * shape of every trace is testable without rendering anything. The component
 * beside this file only binds the result to SVG.
 *
 * Each figure gets its own row rather than sharing one plot: volts, amps and
 * percentages have nothing in common to put on a single axis, and two y-scales
 * on one chart is the mistake that makes a chart lie.
 */

import type { FlightTimelinePointDto } from '@spothub/shared';

import { type NiceScale, niceScale, padded, scale } from '../../chart-scale';

export type TimelineKey = 'voltage' | 'currentA' | 'throttlePct' | 'linkQuality';

/** Every row is the same box, so their axes and their crosshair line up. */
export const TIMELINE_WIDTH = 640;
export const TIMELINE_ROW_HEIGHT = 84;
export const TIMELINE_PAD = { top: 8, right: 10, bottom: 16, left: 40 };
export const TIMELINE_PLOT_W = TIMELINE_WIDTH - TIMELINE_PAD.left - TIMELINE_PAD.right;
export const TIMELINE_PLOT_H =
  TIMELINE_ROW_HEIGHT - TIMELINE_PAD.top - TIMELINE_PAD.bottom;

/** A trace needs at least this many readings to be a line rather than a dot. */
const MIN_READINGS = 2;

export interface TimelineTick {
  readonly y: number;
  readonly label: string;
}

export interface TimelineTrace {
  readonly key: TimelineKey;
  /** What it is, in the reader's words — the row's own direct label. */
  readonly label: string;
  readonly unit: string;
  readonly path: string;
  readonly ticks: readonly TimelineTick[];
  /** Highest and lowest reading, which is what a flight is usually judged on. */
  readonly max: number;
  readonly min: number;
}

export interface TimelineXTick {
  readonly x: number;
  readonly label: string;
}

export interface Timeline {
  readonly traces: readonly TimelineTrace[];
  readonly xTicks: readonly TimelineXTick[];
  /** First and last moment in the log, in milliseconds from take-off. */
  readonly span: readonly [number, number];
}

interface TraceSpec {
  readonly key: TimelineKey;
  readonly label: string;
  readonly unit: string;
  /** A percentage is always drawn full-scale; a reading without one is scaled to fit. */
  readonly fullScale: readonly [number, number] | null;
  readonly decimals: number;
}

const SPECS: readonly TraceSpec[] = [
  {
    key: 'voltage',
    label: 'Pack voltage',
    unit: 'V',
    fullScale: null,
    decimals: 2,
  },
  { key: 'currentA', label: 'Current', unit: 'A', fullScale: null, decimals: 1 },
  {
    key: 'throttlePct',
    label: 'Throttle',
    unit: '%',
    fullScale: [0, 100],
    decimals: 0,
  },
  {
    key: 'linkQuality',
    label: 'Link quality',
    unit: '%',
    fullScale: [0, 100],
    decimals: 0,
  },
];

/**
 * Every trace the log has readings for, in a fixed order, so the same figure
 * keeps the same row and the same colour whichever flight is open.
 */
export function buildTimeline(points: readonly FlightTimelinePointDto[]): Timeline {
  const first = points.at(0);
  const last = points.at(-1);

  if (!first || !last || first.t === last.t) {
    return { traces: [], xTicks: [], span: [0, 0] };
  }

  const span: readonly [number, number] = [first.t, last.t];
  const traces = SPECS.map((spec) => trace(spec, points, span)).filter(
    (built): built is TimelineTrace => built !== null,
  );

  // A clock under no charts is an axis for nothing.
  return { traces, xTicks: traces.length === 0 ? [] : xTicks(span), span };
}

function trace(
  spec: TraceSpec,
  points: readonly FlightTimelinePointDto[],
  span: readonly [number, number],
): TimelineTrace | null {
  const readings = points
    .map((point) => point[spec.key])
    .filter((value): value is number => value !== null);

  // A reading of nothing but zero from end to end is a sensor that is not
  // there, not a flight spent at rest — the same rule the import applies when
  // it stores a flight-long zero current as null rather than as a figure.
  if (readings.length < MIN_READINGS || readings.every((value) => value === 0)) {
    return null;
  }

  const min = Math.min(...readings);
  const max = Math.max(...readings);
  const [low, high] = padded(min, max);
  const { domain, ticks }: NiceScale = spec.fullScale
    ? { domain: spec.fullScale, ticks: [spec.fullScale[0], spec.fullScale[1]] }
    : niceScale(low, high, 2);

  return {
    key: spec.key,
    label: spec.label,
    unit: spec.unit,
    path: pathFor(spec.key, points, span, domain),
    ticks: ticks.map((value) => ({
      y: scale(value, domain, [TIMELINE_PLOT_H, 0]),
      label: format(value, spec.decimals),
    })),
    max: round(max, spec.decimals),
    min: round(min, spec.decimals),
  };
}

/**
 * The line, broken wherever the log has no reading rather than drawn straight
 * across it: a sensor that dropped out for ten seconds did not hold steady.
 */
function pathFor(
  key: TimelineKey,
  points: readonly FlightTimelinePointDto[],
  span: readonly [number, number],
  domain: readonly [number, number],
): string {
  const parts: string[] = [];
  let drawing = false;

  for (const point of points) {
    const value = point[key];

    if (value === null) {
      drawing = false;
      continue;
    }

    const x = scale(point.t, span, [0, TIMELINE_PLOT_W]);
    const y = scale(value, domain, [TIMELINE_PLOT_H, 0]);

    parts.push(`${drawing ? 'L' : 'M'}${trim(x)} ${trim(y)}`);
    drawing = true;
  }

  return parts.join(' ');
}

/** Take-off, the middle and the landing: enough to place a moment, no more. */
function xTicks(span: readonly [number, number]): readonly TimelineXTick[] {
  const [from, to] = span;
  const middle = from + (to - from) / 2;

  return [from, middle, to].map((t) => ({
    x: scale(t, span, [0, TIMELINE_PLOT_W]),
    label: clock(t),
  }));
}

/** Which reading a point along the plot is nearest to; -1 when there are none. */
export function indexAt(
  points: readonly FlightTimelinePointDto[],
  span: readonly [number, number],
  fraction: number,
): number {
  if (points.length === 0) {
    return -1;
  }

  const [from, to] = span;
  const t = from + (to - from) * Math.min(1, Math.max(0, fraction));
  let nearest = 0;

  for (const [index, point] of points.entries()) {
    if (Math.abs(point.t - t) < Math.abs(points[nearest].t - t)) {
      nearest = index;
    }
  }

  return nearest;
}

/** A reading as it is written beside its trace, or an em dash where there is none. */
export function reading(key: TimelineKey, value: number | null): string {
  if (value === null) {
    return '—';
  }

  const spec = SPECS.find((candidate) => candidate.key === key);

  return spec ? `${format(value, spec.decimals)} ${spec.unit}` : String(value);
}

/** Time from take-off, as a stopwatch reads it. */
export function clock(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));

  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`;
}

function format(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** SVG coordinates to a tenth of a pixel: the rest is bytes nobody can see. */
function trim(value: number): string {
  return String(Math.round(value * 10) / 10);
}

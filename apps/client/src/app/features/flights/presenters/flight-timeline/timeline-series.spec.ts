import type { FlightTimelinePointDto } from '@spothub/shared';
import { describe, expect, it } from 'vitest';

import {
  TIMELINE_PLOT_H,
  TIMELINE_PLOT_W,
  buildTimeline,
  clock,
  indexAt,
  reading,
} from './timeline-series';

/**
 * The shape of one flight's charts. What is worth pinning down is which rows
 * a log earns, that a gap in a sensor breaks the line instead of being drawn
 * across, and that a percentage is always shown full-scale — a throttle trace
 * scaled to its own range would make 40% to 45% look like the whole stick.
 */

function point(
  t: number,
  values: Partial<Omit<FlightTimelinePointDto, 't'>> = {},
): FlightTimelinePointDto {
  return {
    t,
    voltage: null,
    currentA: null,
    throttlePct: null,
    linkQuality: null,
    ...values,
  };
}

describe('buildTimeline', () => {
  it('has nothing to draw for a log with no readings in it', () => {
    const timeline = buildTimeline([point(0), point(1000), point(2000)]);

    expect(timeline.traces).toEqual([]);
    expect(timeline.xTicks).toEqual([]);
  });

  it('has nothing to draw for one moment: a flight needs a stretch of time', () => {
    expect(buildTimeline([point(0, { voltage: 16.8 })]).traces).toEqual([]);
  });

  it('gives a row only to the figures the log actually recorded', () => {
    const timeline = buildTimeline([
      point(0, { voltage: 16.8, currentA: 2 }),
      point(1000, { voltage: 15.9, currentA: 30 }),
    ]);

    expect(timeline.traces.map((trace) => trace.key)).toEqual(['voltage', 'currentA']);
  });

  it('leaves out a figure that read zero from end to end: that is a missing sensor', () => {
    const timeline = buildTimeline([
      point(0, { voltage: 16.8, currentA: 0 }),
      point(1000, { voltage: 15.9, currentA: 0 }),
    ]);

    expect(timeline.traces.map((trace) => trace.key)).toEqual(['voltage']);
  });

  it('keeps the rows in one order whichever figures a log has', () => {
    const everything = buildTimeline([
      point(0, { voltage: 16.8, currentA: 2, throttlePct: 10, linkQuality: 100 }),
      point(1000, { voltage: 15.9, currentA: 30, throttlePct: 80, linkQuality: 92 }),
    ]);

    expect(everything.traces.map((trace) => trace.key)).toEqual([
      'voltage',
      'currentA',
      'throttlePct',
      'linkQuality',
    ]);
  });

  it('reports the highest and lowest reading of each row', () => {
    const timeline = buildTimeline([
      point(0, { voltage: 16.8 }),
      point(1000, { voltage: 14.213 }),
      point(2000, { voltage: 15.5 }),
    ]);

    expect(timeline.traces[0]).toMatchObject({ min: 14.21, max: 16.8 });
  });

  it('draws a percentage full-scale, so a small range is not stretched to fill the row', () => {
    const timeline = buildTimeline([
      point(0, { throttlePct: 40 }),
      point(1000, { throttlePct: 45 }),
    ]);

    const [trace] = timeline.traces;

    expect(trace.ticks.map((tick) => tick.label)).toEqual(['0', '100']);
    // 40% and 45% sit low in the row, not at its top and bottom.
    expect(trace.path).toBe(
      `M0 ${String(TIMELINE_PLOT_H * 0.6)} L${String(
        TIMELINE_PLOT_W,
      )} ${String(TIMELINE_PLOT_H * 0.55)}`,
    );
  });

  it('breaks the line where a sensor stopped reporting rather than drawing across it', () => {
    const timeline = buildTimeline([
      point(0, { voltage: 16.8 }),
      point(1000, { voltage: 16.4 }),
      point(2000),
      point(3000, { voltage: 15.2 }),
      point(4000, { voltage: 15.0 }),
    ]);

    // Two runs: one move command each, and the gap is not bridged.
    expect(timeline.traces[0].path.match(/M/g)).toHaveLength(2);
  });

  it('places take-off at the left of the plot and the landing at its right', () => {
    const timeline = buildTimeline([
      point(0, { voltage: 16.8 }),
      point(60_000, { voltage: 15.2 }),
    ]);

    expect(timeline.span).toEqual([0, 60_000]);
    expect(timeline.xTicks.map((tick) => [tick.x, tick.label])).toEqual([
      [0, '0:00'],
      [TIMELINE_PLOT_W / 2, '0:30'],
      [TIMELINE_PLOT_W, '1:00'],
    ]);
  });
});

describe('indexAt', () => {
  const points = [point(0), point(1000), point(2000), point(3000)];

  it('picks the reading nearest the moment pointed at', () => {
    expect(indexAt(points, [0, 3000], 0.5)).toBe(1);
    expect(indexAt(points, [0, 3000], 0.7)).toBe(2);
  });

  it('holds at the ends rather than running off them', () => {
    expect(indexAt(points, [0, 3000], -3)).toBe(0);
    expect(indexAt(points, [0, 3000], 4)).toBe(points.length - 1);
  });

  it('has nothing to pick in an empty log', () => {
    expect(indexAt([], [0, 0], 0.5)).toBe(-1);
  });
});

describe('reading', () => {
  it('writes each figure to the precision its sensor is worth', () => {
    expect(reading('voltage', 15.4321)).toBe('15.43 V');
    expect(reading('currentA', 31.27)).toBe('31.3 A');
    expect(reading('throttlePct', 62.4)).toBe('62 %');
  });

  it('says plainly that there is no reading', () => {
    expect(reading('linkQuality', null)).toBe('—');
  });
});

describe('clock', () => {
  it('counts from take-off, as a stopwatch does', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(9_500)).toBe('0:10');
    expect(clock(185_000)).toBe('3:05');
  });

  it('never runs backwards: a fix a second before the flight is still 0:00', () => {
    expect(clock(-2000)).toBe('0:00');
  });
});

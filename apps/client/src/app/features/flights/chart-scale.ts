/**
 * The arithmetic every hand-rolled chart in the logbook shares: mapping a
 * value into a plot, and picking axis ticks a reader recognises.
 *
 * A file of its own rather than private functions in one chart component,
 * because a spec may not import a component — that would pull in Angular
 * Material and demand the JIT compiler — and because the trends charts and
 * the per-flight timeline would otherwise each carry their own copy.
 */

export interface NiceScale {
  /** The axis's actual extent — the rounded bounds, not the raw data's. */
  readonly domain: readonly [number, number];
  readonly ticks: readonly number[];
}

export function scale(
  value: number,
  domain: readonly [number, number],
  range: readonly [number, number],
): number {
  const [d0, d1] = domain;
  const [r0, r1] = range;

  return d0 === d1 ? (r0 + r1) / 2 : r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
}

/** The classic "nice numbers for graph labels" step, so ticks land on 0 / 25 / 50 rather than 0 / 23.7 / 47.4. */
export function niceStep(roughStep: number): number {
  const exponent = Math.floor(Math.log10(roughStep));
  const fraction = roughStep / 10 ** exponent;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;

  return niceFraction * 10 ** exponent;
}

/**
 * Nice round ticks (0 / 25 / 50, never 23.7 / 47.4) — and, critically, a
 * domain that reaches exactly as far as the widest tick. `niceMax` almost
 * never lands on the data's own max, so scaling data against the raw padded
 * range while drawing gridlines at the rounded one used to send the topmost
 * gridline past the plot's edge — invisible on its own axis, but painted
 * anyway thanks to `overflow: visible`, bleeding into whatever sits above.
 */
export function niceScale(min: number, max: number, count = 4): NiceScale {
  if (min === max) {
    return { domain: [min - 1, max + 1], ticks: [min] };
  }

  const step = niceStep((max - min) / count);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  // An integer step count, not a float accumulator: `value += step` drifts
  // just enough on values like 0.1 to sometimes overshoot into an extra tick.
  const steps = Math.round((niceMax - niceMin) / step);
  const ticks = Array.from(
    { length: steps + 1 },
    (_, i) => Math.round((niceMin + step * i) * 1000) / 1000,
  );

  return { domain: [niceMin, niceMax], ticks };
}

/** Room above and below the data, so a line never runs along the plot's edge. */
export function padded(
  min: number,
  max: number,
  fraction = 0.15,
): readonly [number, number] {
  if (min === max) {
    return [min - 1, max + 1];
  }

  const pad = (max - min) * fraction;
  return [Math.max(0, min - pad), max + pad];
}

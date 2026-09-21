import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import type { FlightTimelinePointDto } from '@spothub/shared';

import {
  TIMELINE_PAD,
  TIMELINE_PLOT_H,
  TIMELINE_PLOT_W,
  TIMELINE_ROW_HEIGHT,
  TIMELINE_WIDTH,
  type TimelineKey,
  buildTimeline,
  clock,
  indexAt,
  reading,
} from './timeline-series';

/**
 * Presenter: one flight, second by second, as its log recorded it — the pack
 * under load, the current it pulled, where the throttle was and how the link
 * held up.
 *
 * Hand-rolled SVG, like the trend charts, and one row per figure: volts, amps
 * and percentages share no axis, and the arithmetic that shapes each row
 * lives in `timeline-series.ts` so it can be tested without a renderer.
 *
 * A moment is picked by pointing at the chart or by dragging the slider,
 * which is also what makes it reachable from a keyboard; the numbers for that
 * moment are written out in full beneath.
 */
@Component({
  selector: 'sh-flight-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './flight-timeline.html',
  styleUrl: './flight-timeline.scss',
})
export class FlightTimeline {
  readonly points = input.required<readonly FlightTimelinePointDto[]>();

  protected readonly width = TIMELINE_WIDTH;
  protected readonly rowHeight = TIMELINE_ROW_HEIGHT;
  protected readonly plotLeft = TIMELINE_PAD.left;
  protected readonly plotTop = TIMELINE_PAD.top;
  protected readonly plotWidth = TIMELINE_PLOT_W;
  protected readonly plotHeight = TIMELINE_PLOT_H;

  protected readonly showTable = signal(false);

  /** Which reading the crosshair is on; null until the chart is touched. */
  private readonly picked = signal<number | null>(null);

  protected readonly timeline = computed(() => buildTimeline(this.points()));

  protected readonly index = computed(() => {
    const picked = this.picked();
    const count = this.points().length;

    return picked === null ? null : Math.min(picked, count - 1);
  });

  protected readonly at = computed(() => {
    const index = this.index();
    return index === null ? null : (this.points()[index] ?? null);
  });

  protected readonly crosshairX = computed(() => {
    const point = this.at();

    if (!point) {
      return null;
    }

    const [from, to] = this.timeline().span;
    return from === to ? 0 : ((point.t - from) / (to - from)) * TIMELINE_PLOT_W;
  });

  protected readonly elapsed = computed(() => {
    const point = this.at();
    return point === null ? null : clock(point.t);
  });

  /** Every fifth reading, so the table is a sample of the flight, not the log. */
  protected readonly tableRows = computed(() => {
    const points = this.points();
    const step = Math.max(1, Math.ceil(points.length / 40));

    return points.filter((_, index) => index % step === 0);
  });

  protected value(point: FlightTimelinePointDto, key: TimelineKey): string {
    return reading(key, point[key]);
  }

  protected clockAt(t: number): string {
    return clock(t);
  }

  /** Point anywhere along the charts to read that moment across all of them. */
  protected pickAt(event: PointerEvent): void {
    const target = event.currentTarget as HTMLElement | null;

    if (!target) {
      return;
    }

    const box = target.getBoundingClientRect();

    if (box.width === 0) {
      return;
    }

    // The SVG scales to the element's width, so the pointer is placed in the
    // chart's own coordinates before the plot's left margin is taken off.
    const inChart = ((event.clientX - box.left) / box.width) * TIMELINE_WIDTH;
    const fraction = (inChart - TIMELINE_PAD.left) / TIMELINE_PLOT_W;

    this.picked.set(indexAt(this.points(), this.timeline().span, fraction));
  }

  protected scrubTo(index: string): void {
    this.picked.set(Number(index));
  }

  protected clear(): void {
    this.picked.set(null);
  }
}

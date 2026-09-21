import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import type { FlightDto } from '@spothub/shared';

import { type NiceScale, niceScale, padded, scale } from '../../chart-scale';

interface HoverPoint {
  readonly title: string;
  readonly lines: readonly string[];
}

interface DumbbellRow {
  readonly x: number;
  readonly startY: number;
  readonly minY: number;
  readonly hitY: number;
  readonly hitHeight: number;
  readonly hover: HoverPoint;
}

interface LinePoint {
  readonly x: number;
  readonly y: number;
  readonly hover: HoverPoint;
}

type WithVoltage = FlightDto & {
  readonly startVoltage: number;
  readonly minVoltage: number;
};
type WithLinkQuality = FlightDto & { readonly minLinkQuality: number };

function hasVoltage(flight: FlightDto): flight is WithVoltage {
  return flight.startVoltage !== null && flight.minVoltage !== null;
}

function hasLinkQuality(flight: FlightDto): flight is WithLinkQuality {
  return flight.minLinkQuality !== null;
}

/**
 * Every chart shares one box. A chart does not need to be square, and giving
 * each the same width, height and padding as
 * its three siblings is what lines up all four titles, axes and plot areas
 * into one even grid instead of leaving the fourth chart an island.
 */
const WIDTH = 640;
const HEIGHT = 200;
const PAD = { top: 12, right: 16, bottom: 24, left: 34 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

const SHORT_DATE = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const LONG_DATE = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function airtimeLabel(seconds: number): string {
  const minutes = Math.round(seconds / 60);

  return minutes >= 60
    ? `${String(Math.floor(minutes / 60))} h ${String(minutes % 60).padStart(2, '0')} min`
    : `${String(minutes)} min`;
}

/**
 * Presenter: four small trend charts over a build's flight history — pack
 * voltage sag, the receiver's link quality, cumulative airtime, and how hard
 * the throttle stick tracks peak current. Renders nothing else and owns no
 * application state; every number comes from `flights`.
 *
 * Hand-rolled SVG rather than a charting library: four small, fixed-shape
 * charts do not carry a dependency's weight, and plain SVG keeps every mark
 * a real DOM node a screen reader's table-view twin can stand next to.
 */
@Component({
  selector: 'sh-flight-trends',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './flight-trends.html',
  styleUrl: './flight-trends.scss',
})
export class FlightTrends {
  readonly flights = input.required<readonly FlightDto[]>();

  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;
  protected readonly plotLeft = PAD.left;
  protected readonly plotTop = PAD.top;
  protected readonly plotRight = WIDTH - PAD.right;
  protected readonly plotBottom = HEIGHT - PAD.bottom;

  protected readonly showTable = signal(false);

  private readonly chronological = computed(() =>
    [...this.flights()].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt)),
  );

  private readonly timeDomain = computed<readonly [number, number]>(() => {
    const flights = this.chronological();

    if (flights.length === 0) {
      return [0, 1];
    }

    const first = Date.parse(flights[0].startedAt);
    const last = Date.parse(flights[flights.length - 1].startedAt);
    return first === last ? [first - 1, last + 1] : [first, last];
  });

  protected readonly xTicks = computed(() => {
    const [start, end] = this.timeDomain();
    const domain = this.timeDomain();

    return [start, end].map((value) => ({
      x: scale(value, domain, [0, PLOT_W]),
      label: SHORT_DATE.format(new Date(value)),
    }));
  });

  // --- Chart 1: pack voltage sag, start -> minimum, per flight -----------

  private readonly voltageScale = computed<NiceScale>(() => {
    const values = this.chronological()
      .filter(hasVoltage)
      .flatMap((flight) => [flight.startVoltage, flight.minVoltage]);

    if (values.length === 0) {
      return { domain: [0, 1], ticks: [] };
    }

    const [min, max] = padded(Math.min(...values), Math.max(...values));
    return niceScale(min, max, 3);
  });

  protected readonly voltageRows = computed<readonly DumbbellRow[]>(() => {
    const flights = this.chronological().filter(hasVoltage);

    if (flights.length === 0) {
      return [];
    }

    const { domain } = this.voltageScale();
    const timeDomain = this.timeDomain();

    return flights.map((flight) => {
      const start = flight.startVoltage;
      const min = flight.minVoltage;
      const x = scale(Date.parse(flight.startedAt), timeDomain, [0, PLOT_W]);

      const startY = scale(start, domain, [PLOT_H, 0]);
      const minY = scale(min, domain, [PLOT_H, 0]);

      return {
        x,
        startY,
        minY,
        hitY: Math.min(startY, minY) - 12,
        hitHeight: Math.abs(minY - startY) + 24,
        hover: {
          title: LONG_DATE.format(new Date(flight.startedAt)),
          lines: [
            `Start ${start.toFixed(1)} V`,
            `Minimum ${min.toFixed(1)} V (sag ${(start - min).toFixed(1)} V)`,
          ],
        },
      };
    });
  });

  protected readonly voltageYTicks = computed(() => {
    const { domain, ticks } = this.voltageScale();

    return ticks.map((value) => ({
      y: scale(value, domain, [PLOT_H, 0]),
      // A pack's whole flight-to-flight range is often under a volt, so a
      // whole-number tick would print the same label at every step.
      label: `${value.toFixed(1)} V`,
    }));
  });

  // --- Chart 2: the receiver's own link quality, worst point per flight --

  protected readonly linkQualityPoints = computed<readonly LinePoint[]>(() => {
    const flights = this.chronological().filter(hasLinkQuality);
    const timeDomain = this.timeDomain();

    return flights.map((flight) => {
      const value = flight.minLinkQuality;
      const x = scale(Date.parse(flight.startedAt), timeDomain, [0, PLOT_W]);
      const y = scale(value, [0, 100], [PLOT_H, 0]);

      return {
        x,
        y,
        hover: {
          title: LONG_DATE.format(new Date(flight.startedAt)),
          lines: [`Link quality ${value.toFixed(0)} %`],
        },
      };
    });
  });

  protected readonly linkQualityPath = computed(() => toPath(this.linkQualityPoints()));
  protected readonly linkQualityArea = computed(() =>
    toArea(this.linkQualityPoints(), PLOT_H),
  );
  protected readonly linkQualityYTicks = [0, 50, 100].map((value) => ({
    y: scale(value, [0, 100], [PLOT_H, 0]),
    label: `${String(value)} %`,
  }));

  // --- Chart 3: cumulative airtime, every flight counts -------------------

  private readonly airtimeScale = computed<NiceScale>(() => {
    const totalMinutes = this.chronological().reduce(
      (sum, flight) => sum + flight.durationS / 60,
      0,
    );
    const [min, max] = padded(0, totalMinutes, 0.1);

    return niceScale(min, max, 3);
  });

  protected readonly airtimePoints = computed<readonly LinePoint[]>(() => {
    const flights = this.chronological();
    const timeDomain = this.timeDomain();
    const { domain } = this.airtimeScale();
    let totalMinutes = 0;

    return flights.map((flight) => {
      totalMinutes += flight.durationS / 60;
      const x = scale(Date.parse(flight.startedAt), timeDomain, [0, PLOT_W]);
      const y = scale(totalMinutes, domain, [PLOT_H, 0]);

      return {
        x,
        y,
        hover: {
          title: LONG_DATE.format(new Date(flight.startedAt)),
          lines: [
            `Total airtime so far: ${airtimeLabel(totalMinutes * 60)}`,
            `This flight: ${airtimeLabel(flight.durationS)}`,
          ],
        },
      };
    });
  });

  protected readonly airtimePath = computed(() => toPath(this.airtimePoints()));
  protected readonly airtimeArea = computed(() => toArea(this.airtimePoints(), PLOT_H));

  protected readonly airtimeYTicks = computed(() => {
    const { domain, ticks } = this.airtimeScale();

    return ticks.map((value) => ({
      y: scale(value, domain, [PLOT_H, 0]),
      label: value >= 60 ? `${(value / 60).toFixed(1)} h` : `${value.toFixed(0)} min`,
    }));
  });

  protected readonly tableRows = computed(() => this.chronological());

  protected readonly hoveredVoltage = signal<HoverPoint | null>(null);
  protected readonly hoveredLinkQuality = signal<HoverPoint | null>(null);
  protected readonly hoveredAirtime = signal<HoverPoint | null>(null);

  protected airtime(seconds: number): string {
    return airtimeLabel(seconds);
  }

  protected shortDate(iso: string): string {
    return SHORT_DATE.format(new Date(iso));
  }
}

function toPath(points: readonly LinePoint[]): string {
  return points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'} ${String(point.x)} ${String(point.y)}`,
    )
    .join(' ');
}

function toArea(points: readonly LinePoint[], plotHeight: number): string {
  if (points.length === 0) {
    return '';
  }

  const line = toPath(points);
  const last = points[points.length - 1];
  const first = points[0];

  return `${line} L ${String(last.x)} ${String(plotHeight)} L ${String(first.x)} ${String(plotHeight)} Z`;
}

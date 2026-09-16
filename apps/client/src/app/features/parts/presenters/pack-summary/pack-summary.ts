import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { PART_CONDITION_LABELS, type FlightDto, type PartDto } from '@spothub/shared';

import { PART_CONDITION_STYLES } from '../../part-condition';
import { TIRED_SAG_TREND, packStats } from './pack-stats';

/** The radio's clock, stored as UTC, so rendered as UTC. */
const SHORT_DATE = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * Presenter: each pack of a battery part side by side — how hard it has been
 * used and how it is holding up. A pack's name picks it for the charts below;
 * which one is picked is the container's to keep.
 */
@Component({
  selector: 'sh-pack-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  templateUrl: './pack-summary.html',
  styleUrl: './pack-summary.scss',
})
export class PackSummary {
  readonly part = input.required<PartDto>();
  /** The flights flown on any of the part's packs. */
  readonly flights = input.required<readonly FlightDto[]>();
  readonly selected = input<string | null>(null);

  /** A unit id to show only that pack, or null for every pack again. */
  readonly packChosen = output<string | null>();

  protected readonly rows = computed(() => packStats(this.part(), this.flights()));
  protected readonly conditionStyles = PART_CONDITION_STYLES;
  protected readonly conditionLabels = PART_CONDITION_LABELS;

  protected choose(unitId: string): void {
    this.packChosen.emit(this.selected() === unitId ? null : unitId);
  }

  protected airtime(seconds: number): string {
    const minutes = Math.round(seconds / 60);

    return minutes >= 60
      ? `${String(Math.floor(minutes / 60))} h ${String(minutes % 60).padStart(2, '0')} min`
      : `${String(minutes)} min`;
  }

  protected date(iso: string): string {
    return SHORT_DATE.format(new Date(iso));
  }

  /** A pack sagging a fifth more than it used to is worth saying out loud. */
  protected trendTone(trend: number | null): string {
    if (trend === null) {
      return 'tone-idle';
    }

    return trend >= TIRED_SAG_TREND ? 'tone-stop' : 'tone-go';
  }

  protected trendLabel(trend: number | null): string {
    if (trend === null) {
      return '—';
    }

    const percent = Math.round(trend * 100);

    return percent > 0 ? `+${String(percent)}%` : `${String(percent)}%`;
  }
}

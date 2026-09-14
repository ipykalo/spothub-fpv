import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  PART_CATEGORY_LABELS,
  PartCategory,
  type PartCondition,
  type PartDto,
  type PartUnitDto,
} from '@spothub/shared';

import { PartDetails } from '../presenters/part-details/part-details';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PartsApi } from '../parts.api';
import { PartsStore } from '../parts.store';
import { unitName } from '../part-condition';
import type { ChoiceOption } from '../../../core/components/choice-option';
import { FilterChips } from '../../../core/components/filter-chips/filter-chips';
import { CollapseAll } from '../../../core/components/section/collapse-all';
import { Section } from '../../../core/components/section/section';
import { SectionGroup } from '../../../core/components/section/section-group';
import { FlightsStore } from '../../flights/flights.store';
import { FlightTrends } from '../../flights/presenters/flight-trends/flight-trends';

/**
 * Container: the read-only part page. Resolves which part to show and owns
 * navigation; the presenter renders it.
 */
@Component({
  selector: 'sh-part-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CollapseAll,
    FilterChips,
    FlightTrends,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    RouterLink,
    PartDetails,
    Section,
  ],
  hostDirectives: [SectionGroup],
  templateUrl: './part-detail.page.html',
  styleUrl: './part-detail.page.scss',
})
export class PartDetailPage {
  /** Route param. Bound via `withComponentInputBinding`. */
  readonly id = input.required<string>();

  private readonly store = inject(PartsStore);
  private readonly api = inject(PartsApi);
  private readonly flights = inject(FlightsStore);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly part = signal<PartDto | null>(null);
  protected readonly loading = signal(true);
  protected readonly failure = signal<string | null>(null);
  protected readonly removingUnitId = signal<string | null>(null);

  /** One pack's flights, or every pack's with null. */
  protected readonly packFilter = signal<string | null>(null);

  /** Only a battery can be named as what a flight ran on. */
  protected readonly isBattery = computed(() => this.part()?.category === PartCategory.Battery);

  protected readonly packOptions = computed<readonly ChoiceOption<string>[]>(() => {
    const part = this.part();

    return part
      ? part.units.map((unit) => ({ value: unit.id, label: unitName(part, unit) }))
      : [];
  });

  /**
   * Flights flown on this part's packs, or on the one pack chosen — which is
   * what shows a single pack wearing out, rather than an average of four.
   */
  protected readonly packFlights = computed(() => {
    const part = this.part();

    if (!part || !this.isBattery()) {
      return [];
    }

    const units = new Set(part.units.map((unit) => unit.id));
    const filter = this.packFilter();
    const chosen = filter !== null && units.has(filter) ? filter : null;

    return this.flights
      .sessions()
      .flatMap((session) => session.flights)
      .filter(
        (flight) =>
          flight.batteryUnitId !== null &&
          (chosen === null ? units.has(flight.batteryUnitId) : flight.batteryUnitId === chosen),
      );
  });

  /** Manufacturer and model are both optional; fall back to the category. */
  protected readonly title = computed(() => {
    const part = this.part();

    if (!part) {
      return 'Part';
    }

    const named = [part.manufacturer, part.model].filter(Boolean).join(' ');
    return named || PART_CATEGORY_LABELS[part.category];
  });

  constructor() {
    // Route inputs land after construction, so this cannot run in the ctor.
    effect(() => {
      const id = this.id();
      untracked(() => void this.hydrate(id));
    });

    // Only a battery's page shows flights; harmless if already loaded.
    effect(() => {
      if (this.isBattery()) {
        untracked(() => {
          if (this.flights.sessions().length === 0) {
            void this.flights.load();
          }
        });
      }
    });
  }

  protected async setCondition(change: {
    unit: PartUnitDto;
    condition: PartCondition;
  }): Promise<void> {
    try {
      await this.store.updateUnit(change.unit.partId, change.unit.id, {
        condition: change.condition,
      });

      await this.reload(change.unit.partId);
    } catch {
      this.snackBar.open('Could not change that unit', undefined, { duration: 4000 });
    }
  }

  protected async addUnit(): Promise<void> {
    const part = this.part();

    if (!part) {
      return;
    }

    try {
      await this.store.addUnit(part.id, {
        condition: 'SERVICEABLE',
        label: null,
        acquiredOn: null,
        notes: null,
      });

      await this.reload(part.id);
    } catch {
      this.snackBar.open('Could not add a unit', undefined, { duration: 4000 });
    }
  }

  /** The API refuses while a unit is fitted; surface that rather than a 409. */
  protected async removeUnit(unit: PartUnitDto): Promise<void> {
    this.removingUnitId.set(unit.id);

    try {
      await this.store.removeUnit(unit.partId, unit.id);
      await this.reload(unit.partId);
    } catch {
      this.snackBar.open('Take it off its build before deleting it', undefined, {
        duration: 4000,
      });
    } finally {
      this.removingUnitId.set(null);
    }
  }

  /**
   * Re-read from the API rather than the store.
   *
   * Opened directly, this page's part was never in the store's list, so a
   * store lookup after a change would return nothing and leave the view
   * showing what it had before.
   */
  private async reload(partId: string): Promise<void> {
    this.part.set(await firstValueFrom(this.api.getOne(partId)));
  }

  private async hydrate(id: string): Promise<void> {
    this.loading.set(true);
    this.failure.set(null);

    const cached = this.store.find(id);

    if (cached) {
      this.part.set(cached);
      this.loading.set(false);
      return;
    }

    try {
      this.part.set(await firstValueFrom(this.api.getOne(id)));
    } catch {
      this.failure.set('That part could not be loaded.');
    } finally {
      this.loading.set(false);
    }
  }
}

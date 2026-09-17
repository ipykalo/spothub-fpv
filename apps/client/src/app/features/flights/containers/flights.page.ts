import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { FlightDto, SessionDto, UpdateFlightDto } from '@spothub/shared';

import type { ChoiceOption } from '../../../core/components/choice-option';
import { FilterChips } from '../../../core/components/filter-chips/filter-chips';
import { GridToolbar } from '../../../core/components/grid-toolbar/grid-toolbar';
import { GridState, gridView } from '../../../core/components/grid-toolbar/grid-view';
import { CollapseAll } from '../../../core/components/section/collapse-all';
import { Section } from '../../../core/components/section/section';
import { SectionGroup } from '../../../core/components/section/section-group';
import { BUILD_STATUS_STYLES } from '../../builds/build-status';
import { BuildsStore } from '../../builds/builds.store';
import { FlightLogsStore } from '../../flight-logs/flight-logs.store';
import {
  LogImportPanel,
  type LogImportRequest,
} from '../../flight-logs/presenters/log-import-panel/log-import-panel';
import { batteryOptions } from '../../parts/part-condition';
import { PartsStore } from '../../parts/parts.store';
import { FlightsStore } from '../flights.store';
import { FlightBulkBar } from '../presenters/flight-bulk-bar/flight-bulk-bar';
import { SessionFlights } from '../presenters/session-flights/session-flights';
import {
  FLIGHT_GRID,
  FLIGHT_SORTS,
  type FlightSortKey,
  flownBuildOptions,
  flownOnBuild,
} from './flight-grid';

/** Sessions are headed by the radio's clock, which is stored as UTC. */
const DAY = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const CLOCK = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

/** The newest few outings start open; the season behind them folded. */
const OPEN_SESSIONS = 3;

/**
 * Earlier than this, the radio's clock was never set: a radio without a
 * working clock battery starts from 1 January 2000 at every power-on.
 */
const CLOCK_SET_AFTER = Date.UTC(2015, 0, 1);

/**
 * Container: the logbook, with the log import above it. Composes the flights
 * and flight-logs stores and owns the side effects; the import panel and each
 * session's flights are presenters.
 */
@Component({
  selector: 'sh-flights-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CollapseAll,
    FilterChips,
    FlightBulkBar,
    GridToolbar,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    Section,
    LogImportPanel,
    SessionFlights,
  ],
  hostDirectives: [SectionGroup],
  templateUrl: './flights.page.html',
  styleUrl: './flights.page.scss',
})
export class FlightsPage {
  protected readonly store = inject(FlightsStore);
  protected readonly imports = inject(FlightLogsStore);
  private readonly builds = inject(BuildsStore);
  private readonly parts = inject(PartsStore);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly openSessions = OPEN_SESSIONS;
  protected readonly addingImport = signal(false);
  protected readonly pendingRemoval = signal<string | null>(null);
  protected readonly bulkSaving = signal(false);

  /** Ticked flights, across every outing. */
  protected readonly selected = signal<ReadonlySet<string>>(new Set());

  /** Every battery pack in the inventory, including broken and retired ones. */
  protected readonly batteries = computed(() => batteryOptions(this.parts.parts()));

  protected readonly sorts = FLIGHT_SORTS;
  protected readonly grid = new GridState<FlightSortKey, string>({
    key: 'date',
    direction: 'asc',
  });

  /** With the status icon the build carries everywhere else. */
  protected readonly buildOptions = computed<readonly ChoiceOption<string>[]>(() =>
    this.builds.builds().map((build) => ({
      value: build.id,
      label: build.name,
      icon: BUILD_STATUS_STYLES[build.status].icon,
    })),
  );

  protected readonly buildFilterOptions = computed(() =>
    flownBuildOptions(this.store.sessions()),
  );

  /**
   * Every session with its flights searched, filtered and sorted; a session
   * a filter leaves empty is dropped, the same as an emptied category on the
   * parts page. Session-level facts — its date range, its total airtime —
   * stay put: they describe the outing, not the current search.
   */
  protected readonly sessions = computed(() => {
    const query = this.grid.query();
    const sort = this.grid.sort();
    const filter = this.grid.filter();
    const active = this.buildFilterOptions().some((option) => option.value === filter)
      ? filter
      : null;

    return this.store
      .sessions()
      .map((session) => ({
        ...session,
        flights: gridView(session.flights, FLIGHT_GRID, query, sort, (flight) =>
          flownOnBuild(flight, active),
        ),
      }))
      .filter((session) => session.flights.length > 0);
  });

  protected readonly shown = computed(() =>
    this.sessions().reduce((sum, session) => sum + session.flights.length, 0),
  );

  /**
   * The ticked flights the search and filters still show. A bulk change lands
   * on these only: a flight a search has hidden stays ticked but is never
   * changed unseen, and a deleted flight drops out on its own.
   */
  protected readonly selectedShown = computed(() => {
    const selected = this.selected();

    return this.sessions()
      .flatMap((session) => session.flights)
      .filter((flight) => selected.has(flight.id))
      .map((flight) => flight.id);
  });

  constructor() {
    void this.store.load();

    // The pickers need the builds and the packs; harmless if already loaded.
    if (this.builds.builds().length === 0) {
      void this.builds.load();
    }

    if (this.parts.parts().length === 0) {
      void this.parts.load();
    }
  }

  protected async onImport(request: LogImportRequest): Promise<void> {
    try {
      await this.imports.importLogs(request.files, request.buildId, request.flownOn);
    } finally {
      // Even a failed import may have stored flights from its other logs.
      await this.store.load();
    }

    const added = this.imports.importedFlights();

    if (this.imports.phase() === 'done' && added > 0) {
      this.snackBar.open(`Imported ${added} flight${added === 1 ? '' : 's'}`, undefined, {
        duration: 3000,
      });
    }
  }

  protected resetImport(): void {
    this.imports.reset();
  }

  /**
   * The section's own "Cancel" button only closes the add form; it does not
   * know about the store. Without this, cancelling after an import has
   * finished left the panel showing forever — `addingImport` was false, but
   * the drop zone's own visibility also keys off the import phase, which
   * "Cancel" never touched.
   */
  protected onAddingChanged(adding: boolean): void {
    this.addingImport.set(adding);

    if (!adding && this.imports.phase() !== 'idle') {
      this.imports.reset();
    }
  }

  protected async onBuildChanged(change: {
    flight: FlightDto;
    buildId: string | null;
  }): Promise<void> {
    await this.assignOne(change.flight, { buildId: change.buildId });
  }

  protected async onBatteryChanged(change: {
    flight: FlightDto;
    batteryUnitId: string | null;
  }): Promise<void> {
    await this.assignOne(change.flight, { batteryUnitId: change.batteryUnitId });
  }

  protected onSelectionChanged(change: {
    flightIds: readonly string[];
    selected: boolean;
  }): void {
    this.selected.update((current) => {
      const next = new Set(current);

      for (const id of change.flightIds) {
        if (change.selected) {
          next.add(id);
        } else {
          next.delete(id);
        }
      }

      return next;
    });
  }

  protected clearSelection(): void {
    this.selected.set(new Set());
  }

  protected async onBulkApply(change: UpdateFlightDto): Promise<void> {
    const flightIds = this.selectedShown();
    this.bulkSaving.set(true);

    try {
      await this.store.assign(flightIds, change);
      this.clearSelection();

      const count = flightIds.length;
      this.snackBar.open(
        `Updated ${String(count)} flight${count === 1 ? '' : 's'}`,
        undefined,
        {
          duration: 3000,
        },
      );
    } catch {
      this.snackBar.open('Could not change those flights', undefined, { duration: 4000 });
    } finally {
      this.bulkSaving.set(false);
    }
  }

  private async assignOne(flight: FlightDto, change: UpdateFlightDto): Promise<void> {
    try {
      await this.store.assign([flight.id], change);
    } catch {
      this.snackBar.open('Could not change that flight', undefined, { duration: 4000 });
    }
  }

  /** The path of the flight just asked for, or closing the one already open. */
  protected onTrackRequested(flight: FlightDto): void {
    void this.imports.showTrack(flight.id);
  }

  protected async onRemove(flight: FlightDto): Promise<void> {
    this.pendingRemoval.set(flight.id);

    try {
      await this.store.removeFlight(flight.id);
      this.snackBar.open('Flight deleted', undefined, { duration: 2500 });
    } catch {
      this.snackBar.open('Could not delete that flight', undefined, { duration: 4000 });
    } finally {
      this.pendingRemoval.set(null);
    }
  }

  protected heading(session: SessionDto): string {
    const start = new Date(session.startedAt);
    const end = new Date(session.endedAt);

    // A blackbox outing has a day but no times; the ones stored only order it.
    if (!session.timeRecorded) {
      return `${DAY.format(start)} · time not recorded`;
    }

    return `${DAY.format(start)} · ${CLOCK.format(start)}–${CLOCK.format(end)}`;
  }

  /** Not the real date: every outing from a radio with no clock lands on 1 January 2000. */
  protected clockUnset(session: SessionDto): boolean {
    return new Date(session.startedAt).getTime() < CLOCK_SET_AFTER;
  }

  protected airtime(seconds: number): string {
    const minutes = Math.round(seconds / 60);

    return minutes >= 60
      ? `${String(Math.floor(minutes / 60))} h ${String(minutes % 60).padStart(2, '0')} min`
      : `${String(minutes)} min`;
  }
}

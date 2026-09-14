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
import type { FlightDto, SessionDto } from '@spothub/shared';

import type { ChoiceOption } from '../../../core/components/choice-option';
import { FilterChips } from '../../../core/components/filter-chips/filter-chips';
import { GridToolbar } from '../../../core/components/grid-toolbar/grid-toolbar';
import {
  type GridSpec,
  GridState,
  type SortOption,
  gridView,
} from '../../../core/components/grid-toolbar/grid-view';
import { CollapseAll } from '../../../core/components/section/collapse-all';
import { Section } from '../../../core/components/section/section';
import { SectionGroup } from '../../../core/components/section/section-group';
import { BUILD_STATUS_STYLES } from '../../builds/build-status';
import { BuildsStore } from '../../builds/builds.store';
import { FlightsStore } from '../flights.store';
import {
  LogImportPanel,
  type LogImportRequest,
} from '../presenters/log-import-panel/log-import-panel';
import { SessionFlights } from '../presenters/session-flights/session-flights';

type FlightSortKey = 'date' | 'duration' | 'voltage' | 'link';

/**
 * A filter value distinct from any real build id, so "flights on no build"
 * is its own chip rather than colliding with `sh-filter-chips`' own `null` —
 * which that component already reserves to mean "All".
 */
const UNASSIGNED_BUILD = '__unassigned__';

const FLIGHT_GRID: GridSpec<FlightDto, FlightSortKey> = {
  text: (flight) => [flight.buildName, flight.modelName, flight.fileName],
  sortBy: {
    date: (flight) => flight.startedAt,
    duration: (flight) => flight.durationS,
    voltage: (flight) => flight.minVoltage,
    link: (flight) => flight.minLinkQuality,
  },
};

const SORTS: readonly SortOption<FlightSortKey>[] = [
  { key: 'date', label: 'Date' },
  { key: 'duration', label: 'Duration', direction: 'desc' },
  // Ascending by default: the worst reading first is what triage wants.
  { key: 'voltage', label: 'Min voltage' },
  { key: 'link', label: 'Link quality' },
];

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
 * Container: the logbook. Owns the stores and the side effects; the import
 * panel and each session's flights are presenters.
 */
@Component({
  selector: 'sh-flights-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CollapseAll,
    FilterChips,
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
  private readonly builds = inject(BuildsStore);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly openSessions = OPEN_SESSIONS;
  protected readonly addingImport = signal(false);
  protected readonly pendingRemoval = signal<string | null>(null);

  protected readonly sorts = SORTS;
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

  /**
   * Only the builds actually flown, from the flights themselves — a build
   * with no logbook entries yet is not a useful filter chip — plus an
   * "Unassigned" chip when at least one flight has no build at all. Reads
   * `buildName` straight off each flight, so this needs the builds store no
   * more than the flights already loaded do.
   */
  protected readonly buildFilterOptions = computed<readonly ChoiceOption<string>[]>(() => {
    const named = new Map<string, string>();
    let unassigned = false;

    for (const session of this.store.sessions()) {
      for (const flight of session.flights) {
        if (flight.buildId === null) {
          unassigned = true;
        } else if (!named.has(flight.buildId)) {
          named.set(flight.buildId, flight.buildName ?? flight.buildId);
        }
      }
    }

    const options = [...named.entries()]
      .sort(([, a], [, b]) => a.localeCompare(b))
      .map(([value, label]) => ({ value, label }));

    return unassigned ? [...options, { value: UNASSIGNED_BUILD, label: 'No build' }] : options;
  });

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
        flights: gridView(
          session.flights,
          FLIGHT_GRID,
          query,
          sort,
          (flight) =>
            active === null ||
            (active === UNASSIGNED_BUILD ? flight.buildId === null : flight.buildId === active),
        ),
      }))
      .filter((session) => session.flights.length > 0);
  });

  protected readonly shown = computed(() =>
    this.sessions().reduce((sum, session) => sum + session.flights.length, 0),
  );

  constructor() {
    void this.store.load();

    // The pickers need the builds; harmless if they are already loaded.
    if (this.builds.builds().length === 0) {
      void this.builds.load();
    }
  }

  protected async onImport(request: LogImportRequest): Promise<void> {
    await this.store.importLogs(request.files, request.buildId);

    const added = this.store.importedFlights();

    if (this.store.phase() === 'done' && added > 0) {
      this.snackBar.open(`Imported ${added} flight${added === 1 ? '' : 's'}`, undefined, {
        duration: 3000,
      });
    }
  }

  protected resetImport(): void {
    this.store.resetImport();
  }

  /**
   * The section's own "Cancel" button only closes the add form; it does not
   * know about the store. Without this, cancelling after an import has
   * finished left the panel showing forever — `addingImport` was false, but
   * the drop zone's own visibility also keys off `store.phase()`, which
   * "Cancel" never touched.
   */
  protected onAddingChanged(adding: boolean): void {
    this.addingImport.set(adding);

    if (!adding && this.store.phase() !== 'idle') {
      this.store.resetImport();
    }
  }

  protected async onBuildChanged(change: {
    flight: FlightDto;
    buildId: string | null;
  }): Promise<void> {
    try {
      await this.store.assignBuild(change.flight.id, change.buildId);
    } catch {
      this.snackBar.open('Could not change that flight', undefined, { duration: 4000 });
    }
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

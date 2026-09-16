import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  CommentSubject,
  SPOT_ACCESS_LABELS,
  SPOT_HAZARD_LABELS,
  SPOT_TERRAIN_LABELS,
  type SpotDto,
  SpotTerrain,
} from '@spothub/shared';

import { choicesFrom } from '../../../core/components/choice-option';
import { FilterChips } from '../../../core/components/filter-chips/filter-chips';
import { GridToolbar } from '../../../core/components/grid-toolbar/grid-toolbar';
import {
  type GridSpec,
  GridState,
  type SortOption,
  gridView,
} from '../../../core/components/grid-toolbar/grid-view';
import { CommentsStore } from '../../comments/comments.store';
import { DeviceLocation, LocationError } from '../device-location';
import { SpotCard } from '../presenters/spot-card/spot-card';
import { SpotMap } from '../presenters/spot-map/spot-map';
import { type LatLng, SPOT_TERRAIN_ICONS, formatCoordinates } from '../spot-style';
import { SpotsStore } from '../spots.store';

type SpotSortKey = 'name' | 'updated' | 'difficulty';

/** Whose spots the page shows: the viewer's own, or ones other pilots shared. */
type SpotScope = 'mine' | 'shared';

const SPOT_GRID: GridSpec<SpotDto, SpotSortKey> = {
  text: (spot) => [
    spot.name,
    spot.locality,
    spot.isDraft ? 'Draft' : null,
    spot.ownedByViewer ? null : spot.ownerName,
    spot.terrain ? SPOT_TERRAIN_LABELS[spot.terrain] : null,
    SPOT_ACCESS_LABELS[spot.access],
    ...spot.hazards.map((hazard) => SPOT_HAZARD_LABELS[hazard]),
  ],
  sortBy: {
    name: (spot) => spot.name,
    updated: (spot) => spot.updatedAt,
    difficulty: (spot) => spot.difficulty,
  },
};

const SORTS: readonly SortOption<SpotSortKey>[] = [
  { key: 'updated', label: 'Recent', direction: 'desc' },
  { key: 'name', label: 'Name' },
  { key: 'difficulty', label: 'Difficulty' },
];

/**
 * Container: the map across the page and the collection beneath it — the
 * viewer's own spots, or, with `?scope=shared`, the ones other pilots shared.
 * The search and the terrain filter narrow both the list and the map.
 *
 * On their own spots, clicking empty map offers to add a spot at that point,
 * and "Add location" does the same from the device's GPS. Shared spots are
 * read-only, so the map there only selects. The viewer's own cards also say
 * how many new comments wait on each.
 */
@Component({
  selector: 'sh-spots-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FilterChips,
    GridToolbar,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatProgressBarModule,
    RouterLink,
    SpotCard,
    SpotMap,
  ],
  templateUrl: './spots.page.html',
  styleUrl: './spots.page.scss',
})
export class SpotsPage {
  /** `?scope=shared`, so the shared list is a link that can be sent. Bound via `withComponentInputBinding`. */
  readonly scope = input<string | undefined>(undefined);

  protected readonly store = inject(SpotsStore);
  protected readonly comments = inject(CommentsStore);
  protected readonly commentSubject = CommentSubject.Spot;
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snackBar = inject(MatSnackBar);
  private readonly location = inject(DeviceLocation);

  private readonly map = viewChild.required(SpotMap, { read: ElementRef<HTMLElement> });

  protected readonly sorts = SORTS;
  protected readonly grid = new GridState<SpotSortKey, SpotTerrain>({
    key: 'updated',
    direction: 'desc',
  });

  protected readonly terrainOptions = choicesFrom(
    Object.values(SpotTerrain),
    SPOT_TERRAIN_LABELS,
    SPOT_TERRAIN_ICONS,
  );

  /** The query parameter, read as one of the two lists; anything unexpected is "mine". */
  protected readonly activeScope = computed<SpotScope>(() =>
    this.scope() === 'shared' ? 'shared' : 'mine',
  );
  protected readonly isShared = computed(() => this.activeScope() === 'shared');

  protected readonly list = computed(() =>
    this.isShared() ? this.store.shared() : this.store.spots(),
  );
  protected readonly loading = computed(() =>
    this.isShared() ? this.store.sharedLoading() : this.store.loading(),
  );
  protected readonly failure = computed(() =>
    this.isShared() ? this.store.sharedError() : this.store.error(),
  );

  protected readonly selectedId = signal<string | null>(null);
  protected readonly picked = signal<LatLng | null>(null);
  protected readonly pendingDelete = signal<string | null>(null);
  protected readonly locating = signal(false);

  protected readonly shown = computed(() => {
    const terrain = this.grid.filter();

    return gridView(
      this.list(),
      SPOT_GRID,
      this.grid.query(),
      this.grid.sort(),
      (spot) => terrain === null || spot.terrain === terrain,
    );
  });

  /** Nothing in the chosen list at all, as opposed to nothing matching a search. */
  protected readonly firstRun = computed(
    () => !this.loading() && this.list().length === 0,
  );

  constructor() {
    void this.store.load();
    void this.comments.loadUnread();

    // Loaded each time the shared list is opened, so it is never stale for long.
    effect(() => {
      if (this.isShared()) {
        untracked(() => void this.store.loadShared());
      }
    });
  }

  protected async setScope(scope: SpotScope): Promise<void> {
    this.selectedId.set(null);
    this.picked.set(null);

    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { scope: scope === 'shared' ? 'shared' : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected coordinates(point: LatLng): string {
    return formatCoordinates(point);
  }

  /** A pin was clicked: select it, and bring its card into view below the map. */
  protected onSpotSelected(spot: SpotDto): void {
    this.select(spot);
    document
      .getElementById(`spot-${spot.id}`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /** A card's "Map" button: select it, and bring the map above back into view. */
  protected showOnMap(spot: SpotDto): void {
    this.select(spot);
    (this.map().nativeElement as HTMLElement).scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    });
  }

  protected onPointPicked(point: LatLng): void {
    this.selectedId.set(null);
    this.picked.set(point);
  }

  protected async addHere(point: LatLng): Promise<void> {
    await this.router.navigate(['/spots/new'], {
      queryParams: { lat: point.lat, lng: point.lng },
    });
  }

  /**
   * One tap at the field: a GPS fix becomes a draft spot straight away, and
   * its edit form opens. The details can be written now or at home.
   */
  protected async addCurrentLocation(): Promise<void> {
    if (this.locating()) {
      return;
    }

    this.locating.set(true);

    try {
      const fix = await this.location.locate();
      const spot = await this.store.createDraft({ lat: fix.lat, lng: fix.lng });

      this.snackBar.open(`Location saved, accurate to ${fix.accuracyM} m`, undefined, {
        duration: 4000,
      });
      await this.router.navigate(['/spots', spot.id, 'edit']);
    } catch (error) {
      const message =
        error instanceof LocationError ? error.message : 'Could not save that location.';
      this.snackBar.open(message, 'OK', { duration: 8000 });
    } finally {
      this.locating.set(false);
    }
  }

  protected async remove(spot: SpotDto): Promise<void> {
    this.pendingDelete.set(spot.id);

    try {
      await this.store.remove(spot.id);

      if (this.selectedId() === spot.id) {
        this.selectedId.set(null);
      }

      this.snackBar.open('Spot deleted', undefined, { duration: 3000 });
    } catch {
      this.snackBar.open('Could not delete that spot', undefined, { duration: 4000 });
    } finally {
      this.pendingDelete.set(null);
    }
  }

  private select(spot: SpotDto): void {
    this.picked.set(null);
    this.selectedId.set(spot.id);
  }
}

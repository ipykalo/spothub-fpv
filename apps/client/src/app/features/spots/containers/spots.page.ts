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
import { Router, RouterLink } from '@angular/router';
import {
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
import { DeviceLocation, LocationError } from '../device-location';
import { SpotCard } from '../presenters/spot-card/spot-card';
import { SpotMap } from '../presenters/spot-map/spot-map';
import { type LatLng, SPOT_TERRAIN_ICONS, formatCoordinates } from '../spot-style';
import { SpotsStore } from '../spots.store';

type SpotSortKey = 'name' | 'updated' | 'difficulty';

const SPOT_GRID: GridSpec<SpotDto, SpotSortKey> = {
  text: (spot) => [
    spot.name,
    spot.locality,
    spot.isDraft ? 'Draft' : null,
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
 * Container: the map and the collection beside it. The search and the terrain
 * filter narrow both — a pin hidden from the list is hidden from the map too.
 *
 * Clicking a pin selects its card; clicking empty map offers to add a spot at
 * that point, which opens the form with the coordinates filled in. "Add
 * location" does the same from the device's GPS without asking anything first.
 */
@Component({
  selector: 'sh-spots-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FilterChips,
    GridToolbar,
    MatButtonModule,
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
  protected readonly store = inject(SpotsStore);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly location = inject(DeviceLocation);

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

  protected readonly selectedId = signal<string | null>(null);
  protected readonly picked = signal<LatLng | null>(null);
  protected readonly pendingDelete = signal<string | null>(null);
  protected readonly locating = signal(false);

  protected readonly shown = computed(() => {
    const terrain = this.grid.filter();

    return gridView(
      this.store.spots(),
      SPOT_GRID,
      this.grid.query(),
      this.grid.sort(),
      (spot) => terrain === null || spot.terrain === terrain,
    );
  });

  /** Nothing saved at all, as opposed to nothing matching a search. */
  protected readonly firstRun = computed(() => this.store.isEmpty());

  constructor() {
    void this.store.load();
  }

  protected coordinates(point: LatLng): string {
    return formatCoordinates(point);
  }

  protected onSpotSelected(spot: SpotDto): void {
    this.picked.set(null);
    this.selectedId.set(spot.id);
    document.getElementById(`spot-${spot.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
}

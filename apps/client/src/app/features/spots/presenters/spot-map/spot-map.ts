import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { SpotDto } from '@spothub/shared';
import * as L from 'leaflet';

import type { LatLng } from '../../spot-style';

/** Where a map with nothing on it opens: most of Europe. */
const OVERVIEW_CENTER: L.LatLngTuple = [49, 15];
const OVERVIEW_ZOOM = 4;

/** Close enough to see the field, the trees and the road in. */
const SPOT_ZOOM = 15;

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

type PinKind = 'spot' | 'selected' | 'picked';

/**
 * Presenter: a Leaflet map of spots, and the one place Leaflet is touched.
 *
 * Inputs in, intents out — it never loads or saves. `picked` is a point
 * chosen but not yet saved, drawn as its own pin; with `pickable`, clicking
 * an empty part of the map hands that point up.
 *
 * Pins are `divIcon`s holding a Material Icons glyph rather than Leaflet's
 * default image markers, whose image URLs a bundler rewrites into paths that
 * do not exist.
 */
@Component({
  selector: 'sh-spot-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './spot-map.html',
  styleUrl: './spot-map.scss',
})
export class SpotMap {
  readonly spots = input<readonly SpotDto[]>([]);
  readonly selectedId = input<string | null>(null);
  readonly picked = input<LatLng | null>(null);
  readonly pickable = input(false);
  readonly label = input('Map');

  readonly spotSelected = output<SpotDto>();
  readonly pointPicked = output<LatLng>();

  private readonly container = viewChild.required<ElementRef<HTMLElement>>('map');
  private readonly map = signal<L.Map | null>(null);
  private readonly pins = L.layerGroup();
  private pickedPin: L.Marker | null = null;

  /** The view is framed once, on first data; after that the owner drives it. */
  private framed = false;
  private lastSelectedId: string | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);

    // Leaflet measures its container, so it cannot start before the view exists.
    afterNextRender(() => {
      const element = this.container().nativeElement;
      const map = L.map(element, { worldCopyJump: true }).setView(
        OVERVIEW_CENTER,
        OVERVIEW_ZOOM,
      );

      L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map);
      this.pins.addTo(map);

      map.on('click', (event: L.LeafletMouseEvent) => {
        if (this.pickable()) {
          const point = event.latlng.wrap();
          this.pointPicked.emit({ lat: round(point.lat), lng: round(point.lng) });
        }
      });

      // A map inside a section that unfolds, or a column that reflows, keeps
      // its old size until told — and draws grey tiles where it grew. Deferred a
      // frame: resizing inside the observer's own callback is a layout loop.
      let frame = 0;
      const resize = new ResizeObserver(() => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => map.invalidateSize());
      });
      resize.observe(element);

      destroyRef.onDestroy(() => {
        cancelAnimationFrame(frame);
        resize.disconnect();
        map.remove();
      });

      this.map.set(map);
    });

    effect(() => {
      const map = this.map();

      if (map) {
        this.drawSpots(map, this.spots(), this.selectedId());
      }
    });

    effect(() => {
      const map = this.map();

      if (map) {
        this.drawPicked(map, this.picked());
      }
    });
  }

  private drawSpots(map: L.Map, spots: readonly SpotDto[], selectedId: string | null): void {
    this.pins.clearLayers();

    for (const spot of spots) {
      const selected = spot.id === selectedId;

      L.marker([spot.lat, spot.lng], {
        icon: pin(selected ? 'selected' : 'spot'),
        title: spot.name,
        alt: spot.name,
        keyboard: true,
        zIndexOffset: selected ? 1000 : 0,
      })
        .on('click', () => {
          this.spotSelected.emit(spot);
        })
        .addTo(this.pins);
    }

    const selected = spots.find((spot) => spot.id === selectedId);

    // Only when the selection changes: a reload of the same list must not
    // yank the view back while someone is panning around.
    if (selected && selectedId !== this.lastSelectedId) {
      map.setView([selected.lat, selected.lng], Math.max(map.getZoom(), 13));
      this.framed = true;
    }

    this.lastSelectedId = selectedId;

    if (!this.framed && spots.length > 0 && untracked(() => this.picked()) === null) {
      this.framed = true;

      if (spots.length === 1) {
        map.setView([spots[0].lat, spots[0].lng], SPOT_ZOOM);
      } else {
        const bounds = L.latLngBounds(spots.map((spot): L.LatLngTuple => [spot.lat, spot.lng]));
        map.fitBounds(bounds, { padding: [32, 32], maxZoom: SPOT_ZOOM });
      }
    }
  }

  private drawPicked(map: L.Map, point: LatLng | null): void {
    if (!point) {
      this.pickedPin?.remove();
      this.pickedPin = null;
      return;
    }

    const at: L.LatLngTuple = [point.lat, point.lng];

    if (this.pickedPin) {
      this.pickedPin.setLatLng(at);
    } else {
      this.pickedPin = L.marker(at, {
        icon: pin('picked'),
        title: 'New spot',
        keyboard: false,
        zIndexOffset: 2000,
      }).addTo(map);
    }

    if (!this.framed) {
      this.framed = true;
      map.setView(at, SPOT_ZOOM);
    } else if (!map.getBounds().contains(at)) {
      map.panTo(at);
    }
  }
}

function pin(kind: PinKind): L.DivIcon {
  return L.divIcon({
    className: `sh-pin sh-pin-${kind}`,
    html: `<span class="material-icons" aria-hidden="true">${kind === 'picked' ? 'add_location' : 'place'}</span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 34],
  });
}

/** Six decimal places, the precision the API stores. */
function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

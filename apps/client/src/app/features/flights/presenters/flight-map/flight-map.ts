import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { ElementRef } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { FlightTrackPointDto } from '@spothub/shared';
import * as L from 'leaflet';

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Padding around the track when the map frames it, so the path is not against the edge. */
const FIT_PADDING: L.PointExpression = [24, 24];

/**
 * Presenter: one flight's path on a map, and a scrubber to follow it.
 *
 * The second place Leaflet is touched, after `spot-map`. They are not one
 * component: that one is a map of pins someone picks a point on, this one is a
 * single line played back. What they share — the tile source, the Material
 * glyph markers, the resize that stops tiles going grey — is small and copied
 * deliberately rather than abstracted into a map framework.
 *
 * Injects nothing but its own element: the points are an input, so the same
 * component would serve a public page.
 */
@Component({
  selector: 'sh-flight-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  templateUrl: './flight-map.html',
  styleUrl: './flight-map.scss',
})
export class FlightMap {
  readonly points = input.required<readonly FlightTrackPointDto[]>();
  /** Height above take-off is what a pilot reads, so the first fix is the zero. */
  readonly takeoffAltitudeM = input<number | null>(null);

  private readonly container = viewChild.required<ElementRef<HTMLElement>>('map');

  /** Which point the scrubber sits on. The last one, so the track starts drawn whole. */
  protected readonly at = signal(0);

  private map: L.Map | null = null;
  private path: L.Polyline | null = null;
  private position: L.Marker | null = null;

  protected readonly count = computed(() => this.points().length);

  /** The point under the scrubber: what the readout shows. */
  protected readonly current = computed(() => this.points().at(this.at()) ?? null);

  /** Seconds into the flight, for the readout beside the slider. */
  protected readonly elapsed = computed(() => {
    const point = this.current();

    return point === null ? '0:00' : clock(point.t);
  });

  /** Height above where it took off, which is what "10 m up" means to a pilot. */
  protected readonly height = computed(() => {
    const altitude = this.current()?.altM;
    const takeoff = this.takeoffAltitudeM();

    if (altitude === null || altitude === undefined) {
      return null;
    }

    return Math.round(altitude - (takeoff ?? 0));
  });

  constructor() {
    const destroyRef = inject(DestroyRef);

    // Leaflet measures its container, so it cannot start before the view exists.
    afterNextRender(() => {
      const element = this.container().nativeElement;
      const map = L.map(element, { worldCopyJump: true, zoomControl: false });

      L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map);
      L.control.zoom({ position: 'topleft' }).addTo(map);

      this.map = map;
      this.draw();

      // A map in a row that unfolds keeps its old size until told, and draws
      // grey where it grew. Deferred a frame: resizing inside the observer's
      // own callback is a layout loop.
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
        this.map = null;
      });
    });

    // A new track replaces the line and reframes the map.
    effect(() => {
      this.points();

      untracked(() => {
        this.at.set(Math.max(0, this.points().length - 1));
        this.draw();
      });
    });

    // Scrubbing moves the marker without redrawing the line.
    effect(() => {
      const point = this.current();

      untracked(() => {
        if (point && this.position) {
          this.position.setLatLng([point.lat, point.lng]);
        }
      });
    });
  }

  protected scrubTo(value: string): void {
    this.at.set(Number(value));
  }

  private draw(): void {
    const map = this.map;
    const points = this.points();

    if (!map) {
      return;
    }

    this.path?.remove();
    this.position?.remove();

    if (points.length === 0) {
      return;
    }

    const line = points.map((point): L.LatLngExpression => [point.lat, point.lng]);

    this.path = L.polyline(line, { color: '#ffbb00', weight: 3 }).addTo(map);
    this.position = L.marker(line[line.length - 1], {
      icon: glyph('flight'),
      keyboard: false,
      // Above the take-off and landing markers: it is the one that moves.
      zIndexOffset: 1000,
    }).addTo(map);

    L.marker(line[0], { icon: glyph('flight_takeoff'), keyboard: false }).addTo(map);
    L.marker(line[line.length - 1], {
      icon: glyph('flight_land'),
      keyboard: false,
    }).addTo(map);

    map.fitBounds(this.path.getBounds(), { padding: FIT_PADDING });
  }
}

/**
 * A Material Icons glyph as a marker. Leaflet's own marker images are URLs a
 * bundler rewrites into paths that do not exist, which is why `spot-map` draws
 * its pins the same way.
 */
function glyph(icon: string): L.DivIcon {
  return L.divIcon({
    className: 'sh-flight-marker',
    html: `<span class="material-icons" aria-hidden="true">${icon}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

/** Milliseconds into the flight as m:ss, which is how long a flight is talked about. */
function clock(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));

  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`;
}

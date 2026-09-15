import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
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

import { DeviceLocation, LocationError } from '../../device-location';
import type { LatLng } from '../../spot-style';

/** Where a map with nothing on it opens: most of Europe. */
const OVERVIEW_CENTER: L.LatLngTuple = [49, 15];
const OVERVIEW_ZOOM = 4;

/** Close enough to see the field, the trees and the road in. */
const SPOT_ZOOM = 15;

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** How long a "could not find you" message stays over the map. */
const NOTICE_MS = 8000;

type PinKind = 'spot' | 'draft' | 'selected' | 'picked';

/**
 * Presenter: a Leaflet map of spots, and the one place Leaflet is touched.
 *
 * Inputs in, intents out — it never loads or saves. `picked` is a point
 * chosen but not yet saved, drawn as its own pin; with `pickable`, clicking
 * an empty part of the map hands that point up.
 *
 * Every map carries its own controls in one column: full screen, zoom, and
 * "show my location". Those are view state — where the phone is gets drawn
 * and forgotten, never saved or handed up — so they live here rather than in
 * each container. `DeviceLocation` holds no state either; it only wraps the
 * browser's API.
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
  /**
   * The map frames its spots once, then leaves the view to whoever is panning.
   * A page that swaps one set of spots for another — mine, then shared —
   * changes this, and the map frames the new set once too.
   */
  readonly frameKey = input('');

  readonly spotSelected = output<SpotDto>();
  readonly pointPicked = output<LatLng>();

  /** A short message over the map, when finding the device's location failed. */
  protected readonly notice = signal<string | null>(null);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly location = inject(DeviceLocation);
  private readonly container = viewChild.required<ElementRef<HTMLElement>>('map');
  private readonly map = signal<L.Map | null>(null);
  private readonly pins = L.layerGroup();
  private readonly youAreHere = L.layerGroup();
  private pickedPin: L.Marker | null = null;

  private fullscreenButton: HTMLButtonElement | null = null;
  /** Full screen by CSS, where the browser has no Fullscreen API (iPhone Safari). */
  private coveringPage = false;
  private noticeTimer = 0;

  /** The view is framed once per `frameKey`, on first data; after that the owner drives it. */
  private framed = false;
  private lastFrameKey: string | null = null;
  private lastSelectedId: string | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);

    // Leaflet measures its container, so it cannot start before the view exists.
    afterNextRender(() => {
      const element = this.container().nativeElement;
      const map = L.map(element, { worldCopyJump: true, zoomControl: false }).setView(
        OVERVIEW_CENTER,
        OVERVIEW_ZOOM,
      );

      L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map);
      this.pins.addTo(map);
      this.youAreHere.addTo(map);

      // Top-left corner controls stack in the order they are added.
      this.fullscreenButton = mapButton('fullscreen', 'Full screen', () => {
        this.toggleFullscreen();
      });
      barControl(this.fullscreenButton).addTo(map);
      L.control.zoom({ position: 'topleft' }).addTo(map);
      const locateButton = mapButton('near_me', 'Show my location', () => {
        void this.locate(map, locateButton);
      });
      barControl(locateButton).addTo(map);

      map.on('click', (event: L.LeafletMouseEvent) => {
        if (this.pickable()) {
          const point = event.latlng.wrap();
          this.pointPicked.emit({ lat: round(point.lat), lng: round(point.lng) });
        }
      });

      // A map inside a section that unfolds, a column that reflows, or a map
      // going full screen keeps its old size until told — and draws grey tiles
      // where it grew. Deferred a frame: resizing inside the observer's own
      // callback is a layout loop.
      let frame = 0;
      const resize = new ResizeObserver(() => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => map.invalidateSize());
      });
      resize.observe(element);

      const onFullscreenChange = (): void => {
        this.syncFullscreenButton();
      };
      const onKeydown = (event: KeyboardEvent): void => {
        // The native API handles Escape itself; the CSS fallback needs it done.
        if (event.key === 'Escape' && this.coveringPage) {
          this.coverPage(false);
        }
      };
      document.addEventListener('fullscreenchange', onFullscreenChange);
      document.addEventListener('keydown', onKeydown);

      destroyRef.onDestroy(() => {
        cancelAnimationFrame(frame);
        window.clearTimeout(this.noticeTimer);
        resize.disconnect();
        document.removeEventListener('fullscreenchange', onFullscreenChange);
        document.removeEventListener('keydown', onKeydown);

        if (this.coveringPage) {
          this.coverPage(false);
        }

        map.remove();
      });

      this.map.set(map);
    });

    effect(() => {
      const map = this.map();
      const frameKey = this.frameKey();

      if (map) {
        // Read in the same effect as the spots, so a new set and its key can
        // never be drawn in the wrong order.
        if (frameKey !== this.lastFrameKey) {
          this.lastFrameKey = frameKey;
          this.framed = false;
        }

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

  private toggleFullscreen(): void {
    const host = this.host.nativeElement;

    if (this.coveringPage) {
      this.coverPage(false);
    } else if (document.fullscreenElement === host) {
      void document.exitFullscreen();
    } else if (document.fullscreenEnabled) {
      host.requestFullscreen().catch(() => {
        this.coverPage(true);
      });
    } else {
      this.coverPage(true);
    }
  }

  private coverPage(on: boolean): void {
    this.coveringPage = on;
    this.host.nativeElement.classList.toggle('map-covers-page', on);
    // The page underneath must not scroll while the map is over it.
    document.body.style.overflow = on ? 'hidden' : '';
    this.syncFullscreenButton();
  }

  private syncFullscreenButton(): void {
    if (!this.fullscreenButton) {
      return;
    }

    const on = this.coveringPage || document.fullscreenElement === this.host.nativeElement;
    setButton(this.fullscreenButton, on ? 'fullscreen_exit' : 'fullscreen', on ? 'Exit full screen' : 'Full screen');
  }

  /** One fresh fix, drawn as a dot with its accuracy circle, then forgotten. */
  private async locate(map: L.Map, button: HTMLButtonElement): Promise<void> {
    if (button.getAttribute('aria-busy') === 'true') {
      return;
    }

    button.setAttribute('aria-busy', 'true');
    this.notice.set(null);

    try {
      const fix = await this.location.locate();
      const at: L.LatLngTuple = [fix.lat, fix.lng];

      this.youAreHere.clearLayers();
      L.circle(at, { radius: fix.accuracyM, className: 'sh-accuracy', interactive: false }).addTo(
        this.youAreHere,
      );
      L.circleMarker(at, { radius: 7, className: 'sh-you-are-here', interactive: false }).addTo(
        this.youAreHere,
      );
      map.setView(at, Math.max(map.getZoom(), SPOT_ZOOM));
    } catch (error) {
      this.showNotice(
        error instanceof LocationError ? error.message : 'Could not find your location.',
      );
    } finally {
      button.removeAttribute('aria-busy');
    }
  }

  private showNotice(message: string): void {
    window.clearTimeout(this.noticeTimer);
    this.notice.set(message);
    this.noticeTimer = window.setTimeout(() => {
      this.notice.set(null);
    }, NOTICE_MS);
  }

  private drawSpots(map: L.Map, spots: readonly SpotDto[], selectedId: string | null): void {
    this.pins.clearLayers();

    for (const spot of spots) {
      const selected = spot.id === selectedId;
      const kind: PinKind = selected ? 'selected' : spot.isDraft ? 'draft' : 'spot';

      L.marker([spot.lat, spot.lng], {
        icon: pin(kind),
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

/** A map control button with a Material Icons glyph, labelled for screen readers. */
function mapButton(icon: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sh-map-button';
  button.addEventListener('click', onClick);
  setButton(button, icon, label);
  return button;
}

function setButton(button: HTMLButtonElement, icon: string, label: string): void {
  const glyph = document.createElement('span');
  glyph.className = 'material-icons';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.textContent = icon;

  button.title = label;
  button.setAttribute('aria-label', label);
  button.replaceChildren(glyph);
}

/**
 * A Leaflet control holding buttons, styled as the zoom control's bar. Clicks
 * and wheel turns stop at the bar, so pressing a button never also picks a
 * point on the map underneath.
 */
function barControl(...buttons: HTMLButtonElement[]): L.Control {
  const control = new L.Control({ position: 'topleft' });

  control.onAdd = (): HTMLElement => {
    const bar = document.createElement('div');
    bar.className = 'leaflet-bar sh-map-bar';
    bar.append(...buttons);
    L.DomEvent.disableClickPropagation(bar);
    L.DomEvent.disableScrollPropagation(bar);
    return bar;
  };

  return control;
}

/** Six decimal places, the precision the API stores. */
function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

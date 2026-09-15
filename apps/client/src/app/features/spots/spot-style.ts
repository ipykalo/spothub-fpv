import { SpotAccess, SpotTerrain } from '@spothub/shared';

import type { StatusStyle } from '../../core/ui/status-style';

/** A point on the map, before or after it becomes a spot. */
export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

/**
 * A glyph per terrain, from the classic Material Icons set `index.html`
 * loads. Presentation only, so it lives in the feature; the labels beside
 * these are shared, because both sides need the same words.
 */
export const SPOT_TERRAIN_ICONS: Readonly<Record<SpotTerrain, string>> = {
  [SpotTerrain.Field]: 'grass',
  [SpotTerrain.Park]: 'park',
  [SpotTerrain.Bando]: 'domain_disabled',
  [SpotTerrain.Forest]: 'forest',
  [SpotTerrain.Quarry]: 'landscape',
  [SpotTerrain.Mountain]: 'terrain',
  [SpotTerrain.Water]: 'water',
  [SpotTerrain.Urban]: 'location_city',
  [SpotTerrain.Track]: 'flag',
  [SpotTerrain.Other]: 'place',
};

/**
 * Access speaks the app's status language: green is fine to fly, red is
 * restricted — the same tones builds and parts use, so nothing new to learn.
 */
export const SPOT_ACCESS_STYLES: Readonly<Record<SpotAccess, StatusStyle>> = {
  [SpotAccess.Open]: { icon: 'check_circle', tone: 'go' },
  [SpotAccess.AskFirst]: { icon: 'pan_tool', tone: 'work' },
  [SpotAccess.Restricted]: { icon: 'block', tone: 'stop' },
  [SpotAccess.Unknown]: { icon: 'help_outline', tone: 'idle' },
};

export const DIFFICULTY_LABELS: Readonly<Record<number, string>> = {
  1: '1 · wide open, easy',
  2: '2 · relaxed',
  3: '3 · some obstacles',
  4: '4 · technical',
  5: '5 · tight and unforgiving',
};

export function formatCoordinates(point: LatLng): string {
  return `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;
}

/** The point on OpenStreetMap, for when the owner wants a full map app. */
export function openStreetMapUrl(point: LatLng): string {
  return `https://www.openstreetmap.org/?mlat=${String(point.lat)}&mlon=${String(point.lng)}#map=16/${String(point.lat)}/${String(point.lng)}`;
}

/**
 * Turn-by-turn directions to the point from wherever the phone is — in the
 * Google Maps app when it is installed, the website otherwise. A plain URL
 * Google documents for exactly this, so no API key is involved.
 */
export function googleDirectionsUrl(point: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${String(point.lat)},${String(point.lng)}`;
}

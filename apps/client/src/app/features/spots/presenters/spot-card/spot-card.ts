import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { SPOT_ACCESS_LABELS, SPOT_TERRAIN_LABELS, type SpotDto } from '@spothub/shared';

import {
  SPOT_ACCESS_STYLES,
  SPOT_TERRAIN_ICONS,
  formatCoordinates,
  googleDirectionsUrl,
} from '../../spot-style';

/**
 * Presenter: one spot in the collection. Renders and announces intent — it
 * never loads, saves or navigates on its own.
 */
@Component({
  selector: 'sh-spot-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatCardModule, MatIconModule, RouterLink],
  templateUrl: './spot-card.html',
  styleUrl: './spot-card.scss',
})
export class SpotCard {
  readonly spot = input.required<SpotDto>();
  readonly selected = input(false);
  readonly deleting = input(false);

  readonly showOnMap = output<SpotDto>();
  readonly delete = output<SpotDto>();

  protected readonly access = computed(() => SPOT_ACCESS_STYLES[this.spot().access]);
  protected readonly accessLabel = computed(() => SPOT_ACCESS_LABELS[this.spot().access]);

  protected readonly terrainIcon = computed(() => {
    const terrain = this.spot().terrain;
    return terrain ? SPOT_TERRAIN_ICONS[terrain] : 'place';
  });

  protected readonly terrainLabel = computed(() => {
    const terrain = this.spot().terrain;
    return terrain ? SPOT_TERRAIN_LABELS[terrain] : 'Terrain not set';
  });

  /** Where it is in words when the owner gave some, else the numbers. */
  protected readonly whereabouts = computed(
    () => this.spot().locality ?? formatCoordinates(this.spot()),
  );

  /** Directions from the phone's position, in Google Maps. */
  protected readonly directionsUrl = computed(() => googleDirectionsUrl(this.spot()));
}

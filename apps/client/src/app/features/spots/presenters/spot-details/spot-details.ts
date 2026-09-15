import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { ClipboardModule } from '@angular/cdk/clipboard';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import {
  SPOT_ACCESS_LABELS,
  SPOT_HAZARD_LABELS,
  SPOT_TERRAIN_LABELS,
  type SpotDto,
  VISIBILITY_LABELS,
} from '@spothub/shared';

import { Section } from '../../../../core/components/section/section';
import {
  DIFFICULTY_LABELS,
  SPOT_ACCESS_STYLES,
  SPOT_TERRAIN_ICONS,
  formatCoordinates,
  googleMapsUrl,
  openStreetMapUrl,
} from '../../spot-style';
import { SpotVideo } from '../spot-video/spot-video';

/** Presenter: the whole spot, read-only. */
@Component({
  selector: 'sh-spot-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ClipboardModule, MatButtonModule, MatCardModule, MatIconModule, Section, SpotVideo],
  templateUrl: './spot-details.html',
  styleUrl: './spot-details.scss',
})
export class SpotDetails {
  readonly spot = input.required<SpotDto>();

  readonly coordinatesCopied = output<boolean>();

  protected readonly coordinates = computed(() => formatCoordinates(this.spot()));
  protected readonly osmUrl = computed(() => openStreetMapUrl(this.spot()));
  protected readonly googleUrl = computed(() => googleMapsUrl(this.spot()));

  protected readonly access = computed(() => SPOT_ACCESS_STYLES[this.spot().access]);
  protected readonly accessLabel = computed(() => SPOT_ACCESS_LABELS[this.spot().access]);
  protected readonly visibilityLabel = computed(() => VISIBILITY_LABELS[this.spot().visibility]);

  protected readonly terrain = computed(() => {
    const terrain = this.spot().terrain;
    return terrain
      ? { icon: SPOT_TERRAIN_ICONS[terrain], label: SPOT_TERRAIN_LABELS[terrain] }
      : null;
  });

  protected readonly difficulty = computed(() => {
    const difficulty = this.spot().difficulty;
    return difficulty === null ? null : (DIFFICULTY_LABELS[difficulty] ?? String(difficulty));
  });

  protected readonly hazards = computed(() =>
    this.spot().hazards.map((hazard) => ({ hazard, label: SPOT_HAZARD_LABELS[hazard] })),
  );
}

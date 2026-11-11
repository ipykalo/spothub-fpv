import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { BuildVideoDto } from '@spothub/shared';

import { YouTubePlayer } from '../../../../core/components/youtube-player/youtube-player';

/**
 * Presenter: a build's videos, each played in place. Nothing is fetched from
 * YouTube until play is pressed on one.
 */
@Component({
  selector: 'sh-build-video-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, YouTubePlayer],
  templateUrl: './build-video-list.html',
  styleUrl: './build-video-list.scss',
})
export class BuildVideoList {
  readonly videos = input.required<readonly BuildVideoDto[]>();
  readonly readOnly = input(true);
  readonly pendingRemoval = input<string | null>(null);

  readonly removeRequested = output<BuildVideoDto>();
}

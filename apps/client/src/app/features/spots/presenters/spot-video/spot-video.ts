import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { type YouTubeVideo, youTubeEmbedUrl, youTubeWatchUrl } from '@spothub/shared';

/**
 * Presenter: a spot's flight video on YouTube, loaded only when asked for.
 *
 * Until play is pressed nothing is fetched from Google — no iframe and no
 * thumbnail — so opening a spot does not tell YouTube who looked at which
 * place. Then the privacy-enhanced player loads in place and starts.
 */
@Component({
  selector: 'sh-spot-video',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './spot-video.html',
  styleUrl: './spot-video.scss',
})
export class SpotVideo {
  readonly video = input.required<YouTubeVideo>();

  private readonly sanitizer = inject(DomSanitizer);

  /** View state only: back to the poster whenever a different video arrives. */
  protected readonly playing = linkedSignal({ source: this.video, computation: () => false });

  protected readonly watchUrl = computed(() => youTubeWatchUrl(this.video()));

  protected readonly embedUrl = computed<SafeResourceUrl | null>(() => {
    const url = youTubeEmbedUrl(this.video());

    // youTubeEmbedUrl checks the id against YouTube's 11-character alphabet,
    // so the only URL ever marked trusted is a fixed youtube-nocookie address.
    return url === null ? null : this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  /** `1:30` for a video that starts 90 seconds in. */
  protected readonly startsAt = computed(() => {
    const seconds = this.video().startS;

    if (seconds === null) {
      return null;
    }

    return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`;
  });
}

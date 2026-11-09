import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  input,
} from '@angular/core';
import type { PostImageDto } from '@spothub/shared';

import { YouTubePlayer } from '../youtube-player/youtube-player';
import { markdownBlocks } from './markdown-render';

/**
 * Presenter: renders Markdown someone wrote — a post, a build's write-up.
 * A paragraph that is only a YouTube link plays in place (`markdownBlocks`).
 *
 * Unencapsulated styles, scoped by the host class: the rendered elements are
 * created by `innerHTML`, so they never carry the attributes Angular's
 * emulated encapsulation would match on.
 */
@Component({
  selector: 'sh-markdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [YouTubePlayer],
  templateUrl: './markdown.html',
  styleUrl: './markdown.scss',
  host: { class: 'sh-markdown block' },
})
export class Markdown {
  readonly source = input<string | null>(null);
  /** The post's own images, which `image:` references resolve to. */
  readonly images = input<readonly PostImageDto[]>([]);

  protected readonly blocks = computed(() => {
    const source = this.source();
    return source ? markdownBlocks(source, this.images()) : [];
  });
}

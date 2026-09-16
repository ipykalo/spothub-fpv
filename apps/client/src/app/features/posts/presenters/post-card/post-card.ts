import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { type PostSummaryDto, VISIBILITY_LABELS, Visibility } from '@spothub/shared';

/**
 * Presenter: one post in a feed — the blog, a build's posts, or the author's
 * own. A full-width row: cover, author and date, a large title, the builds it
 * is about as tags, the summary and how long it takes to read. Injects
 * nothing, so it serves the server-rendered pages as well as the app.
 */
@Component({
  selector: 'sh-post-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MatButtonModule, MatIconModule, RouterLink],
  templateUrl: './post-card.html',
  styleUrl: './post-card.scss',
})
export class PostCard {
  readonly post = input.required<PostSummaryDto>();
  /** The author's own list: the visibility, and Edit and Delete. */
  readonly manage = input(false);
  readonly deleting = input(false);

  readonly delete = output<PostSummaryDto>();

  protected readonly visibilityLabels = VISIBILITY_LABELS;

  /** A draft has no public page yet, so its title opens the editor instead. */
  protected readonly link = computed(() => {
    const post = this.post();
    return post.visibility === Visibility.Private
      ? ['/posts', post.id, 'edit']
      : ['/blog', post.id, post.slug];
  });

  /** The author's initial, in place of a picture — a profile photo would load from Google. */
  protected readonly initial = computed(() =>
    (this.post().authorName ?? 'Pilot').trim().charAt(0).toUpperCase(),
  );
}

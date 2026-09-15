import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { type PostDto, Visibility } from '@spothub/shared';
import { firstValueFrom } from 'rxjs';

import { AuthStore } from '../../../core/auth/auth.store';
import { Markdown } from '../../../core/components/markdown/markdown';
import { injectPageMeta } from '../../../core/seo/page-meta';
import { BuildCard } from '../../builds/presenters/build-card/build-card';
import { LikeButton } from '../../likes/containers/like-button';
import { PostsApi } from '../posts.api';

/**
 * Container: one post, for anyone it is shared with — rendered on the server.
 *
 * Rendered for a visitor. Once in the browser, a reader who turns out to be
 * signed in has the post asked for again as themselves: its author then gets
 * the Edit button, and their own draft — which a visitor is told does not
 * exist — opens.
 */
@Component({
  selector: 'sh-post-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BuildCard,
    DatePipe,
    LikeButton,
    Markdown,
    MatButtonModule,
    MatIconModule,
    RouterLink,
  ],
  templateUrl: './post.page.html',
  styleUrl: './post.page.scss',
})
export class PostPage {
  /** Route param. Bound via `withComponentInputBinding`. */
  readonly id = input.required<string>();
  /** Resolved. Null when there is no such post or it is not shared. */
  readonly post = input<PostDto | null>(null);

  protected readonly auth = inject(AuthStore);
  private readonly api = inject(PostsApi);
  private readonly meta = injectPageMeta();

  private readonly asSignedIn = signal<PostDto | null>(null);

  protected readonly shown = computed(() => this.asSignedIn() ?? this.post());
  protected readonly isDraft = computed(
    () => this.shown()?.visibility === Visibility.Private,
  );

  constructor() {
    effect(() => {
      const post = this.post();

      untracked(() => {
        this.asSignedIn.set(null);
        this.meta.set(
          post
            ? {
                title: post.title,
                description: post.summary ?? post.bodyMd,
                type: 'article',
              }
            : { title: 'Post not found' },
        );
      });
    });

    effect(() => {
      const id = this.id();

      if (this.auth.isAuthenticated()) {
        untracked(() => void this.askAsSignedIn(id));
      }
    });
  }

  private async askAsSignedIn(id: string): Promise<void> {
    try {
      const post = await firstValueFrom(this.api.getOne(id));

      if (this.id() === id) {
        this.asSignedIn.set(post);
      }
    } catch {
      // Not theirs to see either: the page stays as it was rendered.
    }
  }
}

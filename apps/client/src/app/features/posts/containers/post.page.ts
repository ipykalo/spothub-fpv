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
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import {
  CommentSubject,
  type ConversationDto,
  type PostDto,
  ReportSubject,
  Visibility,
} from '@spothub/shared';
import { type Observable, firstValueFrom } from 'rxjs';

import { apiMessage } from '../../../core/api/api-error';

import { AuthStore } from '../../../core/auth/auth.store';
import { Markdown } from '../../../core/components/markdown/markdown';
import { photoSrcset } from '../../../core/images/srcset';
import { injectPageMeta } from '../../../core/seo/page-meta';
import { injectStructuredData } from '../../../core/seo/structured-data';
import { BuildCard } from '../../builds/presenters/build-card/build-card';
import { CommentsSection } from '../../comments/containers/comments-section';
import { LikeButton } from '../../likes/containers/like-button';
import { ReportButton } from '../../reports/containers/report-button/report-button';
import { PostsApi } from '../posts.api';
import { Avatar } from '../../../core/components/avatar/avatar';

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
    Avatar,
    BuildCard,
    CommentsSection,
    DatePipe,
    LikeButton,
    Markdown,
    MatButtonModule,
    MatIconModule,
    ReportButton,
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
  /** Resolved with it: the comments as a visitor sees them. */
  readonly conversation = input<ConversationDto | null>(null);

  protected readonly auth = inject(AuthStore);
  protected readonly commentSubject = CommentSubject.Post;
  protected readonly reportSubject = ReportSubject.Post;
  private readonly api = inject(PostsApi);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly meta = injectPageMeta();
  private readonly data = injectStructuredData();

  private readonly asSignedIn = signal<PostDto | null>(null);

  protected readonly shown = computed(() => this.asSignedIn() ?? this.post());
  /** The cover is one of the post's own images, which carry every version and the original's size. */
  protected readonly coverSrcset = computed(() => {
    const post = this.shown();
    const cover = post?.images.find((image) => image.id === post.coverAssetId);
    return cover ? photoSrcset(cover) : null;
  });
  protected readonly isDraft = computed(
    () => this.shown()?.visibility === Visibility.Private,
  );
  /** An admin reading someone else's post may hide or delete it. */
  protected readonly moderates = computed(
    () => this.auth.isAdmin() && this.shown()?.ownedByViewer === false,
  );
  protected readonly moderating = signal(false);

  constructor() {
    effect(() => {
      const post = this.post();

      untracked(() => {
        this.asSignedIn.set(null);

        if (!post) {
          this.meta.set({ title: 'Post not found' });
          this.data.clear();
          return;
        }

        this.meta.set({
          title: post.title,
          description: post.summary ?? post.bodyMd,
          type: 'article',
          path: `/blog/${post.id}/${post.slug}`,
          imageUrl: post.coverImageUrl,
          publishedAt: post.publishedAt,
          updatedAt: post.updatedAt,
          authorName: post.authorName,
        });
        this.data.setPost(post);
      });
    });

    effect(() => {
      const id = this.id();

      if (this.auth.isAuthenticated()) {
        untracked(() => void this.askAsSignedIn(id));
      }
    });
  }

  /** Hidden, the post is gone for the admin too, so the page goes back to the blog. */
  protected async hide(post: PostDto): Promise<void> {
    await this.moderate(
      this.api.hideAsAdmin(post.id),
      'Post hidden. Show it again from the Admin page.',
    );
  }

  protected async remove(post: PostDto): Promise<void> {
    const by = post.authorName ?? 'a pilot';

    if (window.confirm(`Delete "${post.title}" by ${by}? This cannot be undone.`)) {
      await this.moderate(this.api.removeAsAdmin(post.id), 'Post deleted');
    }
  }

  private async moderate(call: Observable<unknown>, done: string): Promise<void> {
    this.moderating.set(true);

    try {
      await firstValueFrom(call);
      this.snackBar.open(done, undefined, { duration: 4000 });
      await this.router.navigateByUrl('/');
    } catch (error) {
      this.snackBar.open(apiMessage(error, 'Could not do that'), undefined, {
        duration: 4000,
      });
    } finally {
      this.moderating.set(false);
    }
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

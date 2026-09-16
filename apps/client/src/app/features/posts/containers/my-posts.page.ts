import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import type { PostSummaryDto } from '@spothub/shared';

import { PostCard } from '../presenters/post-card/post-card';
import { PostsStore } from '../posts.store';

/** Container: the viewer's own posts, drafts included, with Edit and Delete. */
@Component({
  selector: 'sh-my-posts-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule, PostCard, RouterLink],
  templateUrl: './my-posts.page.html',
  styleUrl: './my-posts.page.scss',
})
export class MyPostsPage {
  protected readonly store = inject(PostsStore);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly pendingDelete = signal<string | null>(null);

  constructor() {
    void this.store.loadMine();
  }

  protected async remove(post: PostSummaryDto): Promise<void> {
    if (!window.confirm(`Delete "${post.title}"? This cannot be undone.`)) {
      return;
    }

    this.pendingDelete.set(post.id);

    try {
      await this.store.remove(post.id);
      this.snackBar.open('Post deleted', undefined, { duration: 3000 });
    } catch {
      this.snackBar.open('Could not delete that post', undefined, { duration: 4000 });
    } finally {
      this.pendingDelete.set(null);
    }
  }
}

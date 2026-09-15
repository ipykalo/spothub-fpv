import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import type { LikesDto } from '@spothub/shared';
import { firstValueFrom } from 'rxjs';

import { AuthStore } from '../../../core/auth/auth.store';
import { type LikeTarget, LikesApi } from '../likes.api';

/**
 * Container: the heart on a post or a build, with its count.
 *
 * It starts from the count the post or build came with, so a page rendered
 * on the server and the browser's first render agree. A press shows the
 * change at once and settles on what the API answers; a failure puts it
 * back. A signed-out reader who presses it is taken to sign in, and back.
 */
@Component({
  selector: 'sh-like-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './like-button.html',
  styleUrl: './like-button.scss',
})
export class LikeButton {
  readonly target = input.required<LikeTarget>();
  readonly subjectId = input.required<string>();
  /** The count the post or build came with. A newer one replaces what is shown. */
  readonly likes = input.required<LikesDto>();

  private readonly auth = inject(AuthStore);
  private readonly api = inject(LikesApi);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly current = linkedSignal(() => this.likes());
  protected readonly busy = signal(false);

  protected readonly label = computed(() => {
    const { count, likedByViewer } = this.current();
    const counted = `${String(count)} ${count === 1 ? 'like' : 'likes'}`;
    return likedByViewer ? `Unlike (${counted})` : `Like (${counted})`;
  });

  protected async toggle(): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      await this.router.navigate(['/login'], {
        queryParams: { returnUrl: this.router.url },
      });
      return;
    }

    const before = this.current();
    const liking = !before.likedByViewer;

    this.current.set({ count: before.count + (liking ? 1 : -1), likedByViewer: liking });
    this.busy.set(true);

    try {
      const call = liking
        ? this.api.like(this.target(), this.subjectId())
        : this.api.unlike(this.target(), this.subjectId());
      this.current.set(await firstValueFrom(call));
    } catch {
      this.current.set(before);
      this.snackBar.open('That did not go through. Try again.', undefined, {
        duration: 3000,
      });
    } finally {
      this.busy.set(false);
    }
  }
}

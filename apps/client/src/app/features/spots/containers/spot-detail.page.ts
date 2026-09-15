import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import type { SpotCommentDto, SpotDto } from '@spothub/shared';
import { firstValueFrom } from 'rxjs';

import { CollapseAll } from '../../../core/components/section/collapse-all';
import { Section } from '../../../core/components/section/section';
import { SectionGroup } from '../../../core/components/section/section-group';
import { CommentForm } from '../../spot-comments/presenters/comment-form/comment-form';
import {
  type AnswerMark,
  type CommentEdit,
  type CommentReply,
  SpotQuestions,
} from '../../spot-comments/presenters/spot-questions/spot-questions';
import { SpotCommentsStore } from '../../spot-comments/spot-comments.store';
import { SpotDetails } from '../presenters/spot-details/spot-details';
import { SpotMap } from '../presenters/spot-map/spot-map';
import { SpotsApi } from '../spots.api';
import { SpotsStore } from '../spots.store';

/**
 * Container: one spot's page. Resolves which spot to show, owns delete and
 * navigation; the map and the details are presenters.
 *
 * Also the composition root for the spot's questions: the comments feature
 * brings its own store and presenters, and this page wires them in, the way
 * the build page composes parts, repairs and photos.
 */
@Component({
  selector: 'sh-spot-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CollapseAll,
    CommentForm,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    RouterLink,
    Section,
    SpotDetails,
    SpotMap,
    SpotQuestions,
  ],
  hostDirectives: [SectionGroup],
  templateUrl: './spot-detail.page.html',
  styleUrl: './spot-detail.page.scss',
})
export class SpotDetailPage {
  /** Route param. Bound via `withComponentInputBinding`. */
  readonly id = input.required<string>();

  private readonly store = inject(SpotsStore);
  private readonly api = inject(SpotsApi);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly comments = inject(SpotCommentsStore);

  protected readonly spot = signal<SpotDto | null>(null);
  protected readonly loading = signal(true);
  protected readonly failure = signal<string | null>(null);
  protected readonly deleting = signal(false);
  /** The ask box is asked for, never shown by default. */
  protected readonly asking = signal(false);

  constructor() {
    // Route inputs land after construction, so this cannot run in the ctor.
    effect(() => {
      const id = this.id();
      untracked(() => void this.hydrate(id));
    });

    // The conversation loads once the spot does, so a spot the viewer cannot open asks nothing.
    effect(() => {
      const found = this.spot();

      if (found) {
        untracked(() => void this.comments.open(found.id));
      }
    });
  }

  protected onCopied(copied: boolean): void {
    this.snackBar.open(copied ? 'Coordinates copied' : 'Could not copy', undefined, {
      duration: 2500,
    });
  }

  protected async remove(spot: SpotDto): Promise<void> {
    this.deleting.set(true);

    try {
      await firstValueFrom(this.api.remove(spot.id));
      // The list may never have been loaded if this page was opened directly.
      if (this.store.find(spot.id)) {
        await this.store.load();
      }

      this.snackBar.open('Spot deleted', undefined, { duration: 3000 });
      await this.router.navigateByUrl('/spots');
    } catch {
      this.snackBar.open('Could not delete that spot', undefined, { duration: 4000 });
      this.deleting.set(false);
    }
  }

  protected async ask(body: string): Promise<void> {
    if (await this.comments.ask(body)) {
      this.asking.set(false);
    } else {
      this.reportFailure();
    }
  }

  protected async reply(reply: CommentReply): Promise<void> {
    if (!(await this.comments.reply(reply.questionId, reply.body))) {
      this.reportFailure();
    }
  }

  protected async edit(edit: CommentEdit): Promise<void> {
    if (!(await this.comments.edit(edit.commentId, edit.body))) {
      this.reportFailure();
    }
  }

  protected async removeComment(comment: SpotCommentDto): Promise<void> {
    const replies =
      this.comments.comments()?.questions.find((question) => question.id === comment.id)?.replies
        .length ?? 0;

    // Deleting a question takes its replies with it, so say so before it happens.
    const prompt =
      replies > 0
        ? `Delete this question and its ${String(replies)} ${replies === 1 ? 'reply' : 'replies'}?`
        : 'Delete this comment?';

    if (!window.confirm(prompt)) {
      return;
    }

    if (await this.comments.remove(comment.id)) {
      this.snackBar.open('Deleted', undefined, { duration: 2500 });
    } else {
      this.reportFailure();
    }
  }

  protected async markAnswer(mark: AnswerMark): Promise<void> {
    if (!(await this.comments.setAnswer(mark.commentId, mark.isAnswer))) {
      this.reportFailure();
    }
  }

  private reportFailure(): void {
    this.snackBar.open(this.comments.error() ?? 'That did not go through.', undefined, {
      duration: 4000,
    });
  }

  private async hydrate(id: string): Promise<void> {
    this.loading.set(true);
    this.failure.set(null);

    const cached = this.store.find(id);

    if (cached) {
      this.spot.set(cached);
      this.loading.set(false);
      return;
    }

    try {
      this.spot.set(await firstValueFrom(this.api.getOne(id)));
    } catch {
      this.failure.set('That spot could not be loaded.');
    } finally {
      this.loading.set(false);
    }
  }
}

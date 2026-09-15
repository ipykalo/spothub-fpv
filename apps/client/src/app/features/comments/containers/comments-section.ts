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
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { type CommentDto, CommentSubject } from '@spothub/shared';

import { Section } from '../../../core/components/section/section';
import { CommentsStore } from '../comments.store';
import { CommentForm } from '../presenters/comment-form/comment-form';
import {
  type AnswerMark,
  type CommentEdit,
  type CommentReply,
  Questions,
} from '../presenters/questions/questions';

/**
 * Container: the Questions section of a spot or a build page — the ask box,
 * the conversation, and every intent a comment can raise.
 *
 * One container for both pages rather than the same handlers written into
 * each: a page drops it in with the subject and whether the viewer owns it,
 * and everything about comments stays in this feature.
 */
@Component({
  selector: 'sh-comments-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommentForm, MatProgressBarModule, Questions, Section],
  templateUrl: './comments-section.html',
  styleUrl: './comments-section.scss',
})
export class CommentsSection {
  readonly subject = input.required<CommentSubject>();
  readonly subjectId = input.required<string>();
  /** The owner answers here; everyone else it is shared with asks. */
  readonly ownedByViewer = input(false);

  protected readonly comments = inject(CommentsStore);
  private readonly snackBar = inject(MatSnackBar);

  /** The ask box is asked for, never shown by default. */
  protected readonly asking = signal(false);

  /** "spot" or "build", for the words on screen and the fold's storage key. */
  protected readonly subjectLabel = computed(() =>
    this.subject() === CommentSubject.Spot ? 'spot' : 'build',
  );

  constructor() {
    // The conversation follows the subject, including a page reused for another one.
    effect(() => {
      const subject = this.subject();
      const subjectId = this.subjectId();

      untracked(() => {
        this.asking.set(false);
        void this.comments.open(subject, subjectId);
      });
    });
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

  protected async remove(comment: CommentDto): Promise<void> {
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
}

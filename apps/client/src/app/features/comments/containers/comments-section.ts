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
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { type CommentDto, CommentSubject, type ConversationDto } from '@spothub/shared';

import { Section } from '../../../core/components/section/section';
import { AuthStore } from '../../../core/auth/auth.store';
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
 *
 * On a public page a signed-out reader sees the conversation and a way to
 * sign in, never an ask box. That page hands in the conversation it was
 * rendered with; once the reader turns out to be signed in, it is asked for
 * again so their own permissions show.
 */
@Component({
  selector: 'sh-comments-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommentForm, MatButtonModule, MatProgressBarModule, Questions, Section],
  templateUrl: './comments-section.html',
  styleUrl: './comments-section.scss',
})
export class CommentsSection {
  readonly subject = input.required<CommentSubject>();
  readonly subjectId = input.required<string>();
  /** The owner answers here; everyone else it is shared with asks. */
  readonly ownedByViewer = input(false);
  /** The conversation a server-rendered page was rendered with, adopted rather than fetched. */
  readonly initial = input<ConversationDto | null>(null);

  protected readonly comments = inject(CommentsStore);
  protected readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  /** The ask box is asked for, never shown by default. */
  protected readonly asking = signal(false);

  /** "spot" or "build", for the words on screen and the fold's storage key. */
  protected readonly subjectLabel = computed(() =>
    this.subject() === CommentSubject.Spot ? 'spot' : 'build',
  );

  constructor() {
    // The conversation follows the subject, including a page reused for
    // another one, and whether the reader is signed in.
    effect(() => {
      const subject = this.subject();
      const subjectId = this.subjectId();
      const signedIn = this.auth.isAuthenticated();

      untracked(() => {
        this.asking.set(false);
        void this.comments.open(subject, subjectId, signedIn ? null : this.initial());
      });
    });
  }

  protected signIn(): void {
    void this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
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
    const question = this.comments.comments()?.questions.find((entry) => entry.id === comment.id);
    const replies = question?.replies.length ?? 0;
    const counted = `${String(replies)} ${replies === 1 ? 'reply' : 'replies'}`;

    // Say what goes before it goes: an asker's own question leaves its replies
    // behind, while the owner removing someone's question takes the thread.
    let prompt = 'Delete this comment?';

    if (replies > 0) {
      prompt = question?.byViewer
        ? `Delete your question? Its ${counted} will stay, under "Question deleted".`
        : `Delete this question and its ${counted}?`;
    }

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

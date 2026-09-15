import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, linkedSignal, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { SpotCommentDto, SpotCommentsDto } from '@spothub/shared';

import { CommentForm } from '../comment-form/comment-form';

export interface CommentReply {
  readonly questionId: string;
  readonly body: string;
}

export interface CommentEdit {
  readonly commentId: string;
  readonly body: string;
}

export interface AnswerMark {
  readonly commentId: string;
  readonly isAnswer: boolean;
}

/**
 * Presenter: a spot's questions, each with its replies. Renders what the
 * server's flags allow — Edit on the viewer's own words, Delete where they
 * may, "Mark as answer" for the spot's owner — and hands every intent up.
 *
 * Which reply or edit box is open is view state. It closes whenever a new
 * conversation arrives, which is what a successful save produces; a failed
 * one leaves the box open with the words still in it.
 */
@Component({
  selector: 'sh-spot-questions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommentForm, DatePipe, MatButtonModule, MatIconModule, NgTemplateOutlet],
  templateUrl: './spot-questions.html',
  styleUrl: './spot-questions.scss',
})
export class SpotQuestions {
  readonly comments = input.required<SpotCommentsDto>();
  readonly saving = input(false);

  readonly replied = output<CommentReply>();
  readonly edited = output<CommentEdit>();
  readonly deleted = output<SpotCommentDto>();
  readonly answerMarked = output<AnswerMark>();

  protected readonly replyingTo = linkedSignal<SpotCommentsDto, string | null>({
    source: this.comments,
    computation: () => null,
  });

  protected readonly editing = linkedSignal<SpotCommentsDto, string | null>({
    source: this.comments,
    computation: () => null,
  });

  protected author(comment: SpotCommentDto): string {
    return comment.byViewer ? 'You' : (comment.authorName ?? 'A pilot');
  }

  protected startReply(questionId: string): void {
    this.editing.set(null);
    this.replyingTo.set(questionId);
  }

  protected startEdit(commentId: string): void {
    this.replyingTo.set(null);
    this.editing.set(commentId);
  }
}

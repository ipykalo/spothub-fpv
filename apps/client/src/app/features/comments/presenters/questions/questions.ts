import { DatePipe, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { CommentDto, ConversationDto } from '@spothub/shared';

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
 * Presenter: the questions on a spot or a build, each with its replies.
 * Renders what the server's flags allow — Edit on the viewer's own words,
 * Delete where they may, "Mark as answer" for the asker and the owner — and
 * hands every intent up.
 *
 * Which reply or edit box is open is view state. It closes whenever a new
 * conversation arrives, which is what a successful save produces; a failed
 * one leaves the box open with the words still in it.
 */
@Component({
  selector: 'sh-questions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommentForm, DatePipe, MatButtonModule, MatIconModule, NgTemplateOutlet],
  templateUrl: './questions.html',
  styleUrl: './questions.scss',
})
export class Questions {
  readonly comments = input.required<ConversationDto>();
  /** "spot", "build" or "post" — what the empty state talks about. Under a post it is a discussion. */
  readonly subjectLabel = input('spot');
  readonly saving = input(false);
  /** For a signed-out reader: the conversation, with nothing to reply with. */
  readonly readOnly = input(false);

  readonly replied = output<CommentReply>();
  readonly edited = output<CommentEdit>();
  readonly deleted = output<CommentDto>();
  readonly answerMarked = output<AnswerMark>();

  /** Comments under a post rather than questions: different words, the same thread. */
  protected readonly isPost = computed(() => this.subjectLabel() === 'post');

  protected readonly replyingTo = linkedSignal<ConversationDto, string | null>({
    source: this.comments,
    computation: () => null,
  });

  protected readonly editing = linkedSignal<ConversationDto, string | null>({
    source: this.comments,
    computation: () => null,
  });

  protected author(comment: CommentDto): string {
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

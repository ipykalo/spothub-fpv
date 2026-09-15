import { Injectable, inject, signal } from '@angular/core';
import { CommentSubject, type ConversationDto, type UnreadCommentsDto } from '@spothub/shared';
import { type Observable, firstValueFrom } from 'rxjs';

import { CommentsApi } from './comments.api';

const NO_UNREAD: UnreadCommentsDto = {
  spots: { total: 0, bySubject: {} },
  builds: { total: 0, bySubject: {} },
};

interface OpenSubject {
  readonly subject: CommentSubject;
  readonly subjectId: string;
}

/**
 * Signal-backed state for comments: the conversation on the spot or build
 * being looked at, and how many comments wait unread on the viewer's own.
 *
 * Every change adopts the conversation the server answers with, so there is
 * no local tree to keep in step — and a response for a subject the viewer has
 * already left is dropped.
 */
@Injectable({ providedIn: 'root' })
export class CommentsStore {
  private readonly api = inject(CommentsApi);

  private readonly current = signal<OpenSubject | null>(null);
  private readonly conversation = signal<ConversationDto | null>(null);
  private readonly busy = signal(false);
  private readonly writing = signal(false);
  private readonly failure = signal<string | null>(null);
  private readonly unreadCounts = signal<UnreadCommentsDto>(NO_UNREAD);

  readonly comments = this.conversation.asReadonly();
  readonly loading = this.busy.asReadonly();
  readonly saving = this.writing.asReadonly();
  readonly error = this.failure.asReadonly();
  readonly unread = this.unreadCounts.asReadonly();

  /** New comments waiting on one of the viewer's spots or builds. */
  unreadFor(subject: CommentSubject, subjectId: string): number {
    const counts =
      subject === CommentSubject.Spot ? this.unreadCounts().spots : this.unreadCounts().builds;

    return counts.bySubject[subjectId] ?? 0;
  }

  /**
   * Loads a conversation; opening their own spot or build is the owner reading it.
   *
   * A page rendered on the server hands in the conversation it was rendered
   * with, which is adopted at once rather than fetched: the browser's first
   * render has to match the server's, and a fetch would only land after it.
   */
  async open(
    subject: CommentSubject,
    subjectId: string,
    initial: ConversationDto | null = null,
  ): Promise<void> {
    const opened: OpenSubject = { subject, subjectId };
    const previous = this.current();

    this.current.set(opened);
    this.failure.set(null);

    if (initial) {
      this.conversation.set(initial);
      this.busy.set(false);
      return;
    }

    // Asking again about the same subject keeps what is shown until the answer lands.
    if (previous?.subject !== subject || previous.subjectId !== subjectId) {
      this.conversation.set(null);
    }

    this.busy.set(true);

    try {
      const conversation = await firstValueFrom(this.api.list(subject, subjectId));

      if (this.current() !== opened) {
        return;
      }

      this.conversation.set(conversation);

      if (conversation.viewerOwnsSubject) {
        await firstValueFrom(this.api.markRead(subject, subjectId));
        await this.loadUnread();
      }
    } catch {
      this.failure.set('Could not load the questions.');
    } finally {
      this.busy.set(false);
    }
  }

  async loadUnread(): Promise<void> {
    try {
      this.unreadCounts.set(await firstValueFrom(this.api.unread()));
    } catch {
      // The badges keep what they last knew; nothing here is worth an error.
    }
  }

  ask(body: string): Promise<boolean> {
    return this.change(({ subject, subjectId }) =>
      this.api.create(subject, subjectId, { body, parentId: null }),
    );
  }

  reply(questionId: string, body: string): Promise<boolean> {
    return this.change(({ subject, subjectId }) =>
      this.api.create(subject, subjectId, { body, parentId: questionId }),
    );
  }

  edit(commentId: string, body: string): Promise<boolean> {
    return this.change(({ subject, subjectId }) =>
      this.api.update(subject, subjectId, commentId, { body }),
    );
  }

  remove(commentId: string): Promise<boolean> {
    return this.change(({ subject, subjectId }) => this.api.remove(subject, subjectId, commentId));
  }

  setAnswer(commentId: string, isAnswer: boolean): Promise<boolean> {
    return this.change(({ subject, subjectId }) =>
      this.api.setAnswer(subject, subjectId, commentId, { isAnswer }),
    );
  }

  /** Runs one change against the open subject and adopts the conversation it answers with. */
  private async change(call: (open: OpenSubject) => Observable<ConversationDto>): Promise<boolean> {
    const open = this.current();

    if (open === null) {
      return false;
    }

    this.writing.set(true);
    this.failure.set(null);

    try {
      const conversation = await firstValueFrom(call(open));

      if (this.current() === open) {
        this.conversation.set(conversation);
      }

      return true;
    } catch {
      this.failure.set('That did not go through. Try again.');
      return false;
    } finally {
      this.writing.set(false);
    }
  }
}

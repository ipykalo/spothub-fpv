import { Injectable, inject, signal } from '@angular/core';
import type { SpotCommentsDto, UnreadSpotCommentsDto } from '@spothub/shared';
import { type Observable, firstValueFrom } from 'rxjs';

import { SpotCommentsApi } from './spot-comments.api';

const NO_UNREAD: UnreadSpotCommentsDto = { total: 0, bySpot: {} };

/**
 * Signal-backed state for comments: the conversation on the spot being
 * looked at, and how many comments wait unread on the viewer's own spots.
 *
 * Every change adopts the conversation the server answers with, so there is
 * no local tree to keep in step — and a response for a spot the viewer has
 * already left is dropped.
 */
@Injectable({ providedIn: 'root' })
export class SpotCommentsStore {
  private readonly api = inject(SpotCommentsApi);

  private readonly spotId = signal<string | null>(null);
  private readonly conversation = signal<SpotCommentsDto | null>(null);
  private readonly busy = signal(false);
  private readonly writing = signal(false);
  private readonly failure = signal<string | null>(null);
  private readonly unreadCounts = signal<UnreadSpotCommentsDto>(NO_UNREAD);

  readonly comments = this.conversation.asReadonly();
  readonly loading = this.busy.asReadonly();
  readonly saving = this.writing.asReadonly();
  readonly error = this.failure.asReadonly();
  readonly unread = this.unreadCounts.asReadonly();

  /** New comments waiting on one of the viewer's spots. */
  unreadFor(spotId: string): number {
    return this.unreadCounts().bySpot[spotId] ?? 0;
  }

  /** Loads a spot's conversation; opening their own spot is the owner reading it. */
  async open(spotId: string): Promise<void> {
    this.spotId.set(spotId);
    this.conversation.set(null);
    this.failure.set(null);
    this.busy.set(true);

    try {
      const conversation = await firstValueFrom(this.api.list(spotId));

      if (this.spotId() !== spotId) {
        return;
      }

      this.conversation.set(conversation);

      if (conversation.viewerOwnsSpot) {
        await firstValueFrom(this.api.markRead(spotId));
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
      // The badge keeps what it last knew; nothing here is worth an error.
    }
  }

  ask(body: string): Promise<boolean> {
    return this.change((spotId) => this.api.create(spotId, { body, parentId: null }));
  }

  reply(questionId: string, body: string): Promise<boolean> {
    return this.change((spotId) => this.api.create(spotId, { body, parentId: questionId }));
  }

  edit(commentId: string, body: string): Promise<boolean> {
    return this.change((spotId) => this.api.update(spotId, commentId, { body }));
  }

  remove(commentId: string): Promise<boolean> {
    return this.change((spotId) => this.api.remove(spotId, commentId));
  }

  setAnswer(commentId: string, isAnswer: boolean): Promise<boolean> {
    return this.change((spotId) => this.api.setAnswer(spotId, commentId, { isAnswer }));
  }

  /** Runs one change against the open spot and adopts the conversation it answers with. */
  private async change(call: (spotId: string) => Observable<SpotCommentsDto>): Promise<boolean> {
    const spotId = this.spotId();

    if (spotId === null) {
      return false;
    }

    this.writing.set(true);
    this.failure.set(null);

    try {
      const conversation = await firstValueFrom(call(spotId));

      if (this.spotId() === spotId) {
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

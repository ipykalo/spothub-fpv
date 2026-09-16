import { Injector, runInInjectionContext } from '@angular/core';
import {
  CommentSubject,
  type ConversationDto,
  type UnreadCommentsDto,
} from '@spothub/shared';
import { type Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CommentsApi } from './comments.api';
import { CommentsStore } from './comments.store';

/**
 * The conversation on whatever is open, and the unread badges.
 *
 * Every change answers with the whole conversation, so the store adopts what
 * it is given rather than patching a local tree — and an answer for something
 * the reader has already navigated away from is dropped, which is the part
 * worth pinning down.
 */
describe('CommentsStore', () => {
  const conversation = (questions: number, owns = false): ConversationDto => ({
    questions: Array.from({ length: questions }, (_, index) => ({
      id: `question-${String(index)}`,
      body: 'Which props?',
      authorName: 'Oleh',
      byOwner: false,
      byViewer: false,
      canDelete: false,
      deleted: false,
      isAnswer: false,
      canMarkAnswer: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      editedAt: null,
      replies: [],
      answered: false,
    })),
    viewerOwnsSubject: owns,
  });

  const unread: UnreadCommentsDto = {
    spots: { total: 1, bySubject: { 'spot-1': 1 } },
    builds: { total: 2, bySubject: { 'build-1': 2 } },
    posts: { total: 0, bySubject: {} },
  };

  class FakeApi {
    answer = conversation(1);
    listFails = false;
    writeFails = false;
    readMarked: string[] = [];
    unreadAsked = 0;

    list(): Observable<ConversationDto> {
      return this.listFails ? throwError(() => new Error('offline')) : of(this.answer);
    }

    create(): Observable<ConversationDto> {
      return this.write();
    }

    update(): Observable<ConversationDto> {
      return this.write();
    }

    remove(): Observable<ConversationDto> {
      return this.write();
    }

    setAnswer(): Observable<ConversationDto> {
      return this.write();
    }

    markRead(_subject: CommentSubject, subjectId: string): Observable<null> {
      this.readMarked.push(subjectId);

      return of(null);
    }

    unread(): Observable<UnreadCommentsDto> {
      this.unreadAsked += 1;

      return of(unread);
    }

    private write(): Observable<ConversationDto> {
      return this.writeFails ? throwError(() => new Error('nope')) : of(conversation(2));
    }
  }

  let api: FakeApi;
  let store: CommentsStore;

  beforeEach(() => {
    api = new FakeApi();
    const injector = Injector.create({
      providers: [{ provide: CommentsApi, useValue: api }],
    });

    store = runInInjectionContext(injector, () => new CommentsStore());
  });

  describe('opening', () => {
    it('loads the conversation on what was opened', async () => {
      await store.open(CommentSubject.Build, 'build-1');

      expect(store.comments()?.questions).toHaveLength(1);
      expect(store.loading()).toBe(false);
      expect(store.error()).toBeNull();
    });

    it('adopts the conversation a server-rendered page hands in, without asking again', async () => {
      const asked = vi.spyOn(api, 'list');

      await store.open(CommentSubject.Post, 'post-1', conversation(3));

      expect(asked).not.toHaveBeenCalled();
      expect(store.comments()?.questions).toHaveLength(3);
    });

    it('marks the subject read when the reader owns it, and refreshes the badges', async () => {
      api.answer = conversation(1, true);

      await store.open(CommentSubject.Build, 'build-1');

      expect(api.readMarked).toEqual(['build-1']);
      expect(api.unreadAsked).toBe(1);
      expect(store.unreadFor(CommentSubject.Build, 'build-1')).toBe(2);
    });

    it('marks nothing read on someone else’s subject', async () => {
      await store.open(CommentSubject.Build, 'build-1');

      expect(api.readMarked).toEqual([]);
    });

    it('says so when the conversation could not be loaded', async () => {
      api.listFails = true;

      await store.open(CommentSubject.Spot, 'spot-1');

      expect(store.error()).toBe('Could not load the questions.');
      expect(store.loading()).toBe(false);
    });

    it('drops an answer for something the reader has already left', async () => {
      const slow = store.open(CommentSubject.Build, 'build-1');
      await store.open(CommentSubject.Build, 'build-2', conversation(3));
      await slow;

      // The second subject is the one on screen, so the first must not overwrite it.
      expect(store.comments()?.questions).toHaveLength(3);
    });
  });

  describe('writing', () => {
    beforeEach(async () => {
      await store.open(CommentSubject.Build, 'build-1');
    });

    it('adopts the conversation each change answers with', async () => {
      await expect(store.ask('Which props?')).resolves.toBe(true);

      expect(store.comments()?.questions).toHaveLength(2);
      expect(store.saving()).toBe(false);
    });

    it('sends a reply, an edit, a delete and an answer mark the same way', async () => {
      await expect(store.reply('question-0', 'HQ triblades')).resolves.toBe(true);
      await expect(store.edit('question-0', 'Reworded')).resolves.toBe(true);
      await expect(store.remove('question-0')).resolves.toBe(true);
      await expect(store.setAnswer('question-0', true)).resolves.toBe(true);
    });

    it('reports a change that did not go through, and keeps what was shown', async () => {
      api.writeFails = true;

      await expect(store.ask('Which props?')).resolves.toBe(false);

      expect(store.error()).toBe('That did not go through. Try again.');
      expect(store.comments()?.questions).toHaveLength(1);
    });
  });

  it('refuses to write when nothing is open', async () => {
    await expect(store.ask('into the void')).resolves.toBe(false);
  });

  describe('unread badges', () => {
    it('counts nothing before they have been loaded', () => {
      expect(store.unreadFor(CommentSubject.Spot, 'spot-1')).toBe(0);
      expect(store.unread().builds.total).toBe(0);
    });

    it('answers per subject once loaded, and zero for one with nothing waiting', async () => {
      await store.loadUnread();

      expect(store.unreadFor(CommentSubject.Spot, 'spot-1')).toBe(1);
      expect(store.unreadFor(CommentSubject.Build, 'build-1')).toBe(2);
      expect(store.unreadFor(CommentSubject.Post, 'post-1')).toBe(0);
    });
  });
});

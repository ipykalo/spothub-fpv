import { HttpErrorResponse } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import type { BlockedPilotDto } from '@spothub/shared';
import { type Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { BlocksApi } from './blocks.api';
import { BlocksStore } from './blocks.store';

/** The pilots someone blocked: listed on their account page, added from a comment. */
describe('BlocksStore', () => {
  class FakeApi {
    pilots: BlockedPilotDto[] = [
      { userId: 'u1', name: 'Troll T.', blockedAt: '2026-11-13T00:00:00.000Z' },
      { userId: 'u2', name: 'Spammer S.', blockedAt: '2026-11-12T00:00:00.000Z' },
    ];
    fails: unknown = null;
    calls: string[] = [];

    list(): Observable<BlockedPilotDto[]> {
      return this.answer(this.pilots);
    }

    block(userId: string): Observable<unknown> {
      this.calls.push(`block ${userId}`);
      return this.answer(null);
    }

    unblock(userId: string): Observable<unknown> {
      this.calls.push(`unblock ${userId}`);
      return this.answer(null);
    }

    private answer<T>(value: T): Observable<T> {
      return this.fails === null ? of(value) : throwError(() => this.fails);
    }
  }

  let api: FakeApi;
  let store: BlocksStore;

  beforeEach(() => {
    api = new FakeApi();
    const injector = Injector.create({
      providers: [{ provide: BlocksApi, useValue: api }],
    });
    store = runInInjectionContext(injector, () => new BlocksStore());
  });

  it('loads the list', async () => {
    await store.load();
    expect(store.blocked().map((pilot) => pilot.userId)).toEqual(['u1', 'u2']);
    expect(store.error()).toBeNull();
  });

  it('says so when the list cannot be loaded', async () => {
    api.fails = new Error('offline');
    await store.load();
    expect(store.blocked()).toEqual([]);
    expect(store.error()).toBe('Could not load the pilots you blocked.');
  });

  it('unblocking takes the pilot off the list', async () => {
    await store.load();
    expect(await store.unblock('u1')).toBe(true);
    expect(api.calls).toEqual(['unblock u1']);
    expect(store.blocked().map((pilot) => pilot.userId)).toEqual(['u2']);
    expect(store.saving()).toBe(false);
  });

  it('blocking hands on what the server said when it refuses', async () => {
    expect(await store.block('u3')).toBe(true);
    expect(api.calls).toEqual(['block u3']);

    api.fails = new HttpErrorResponse({
      status: 400,
      error: { message: 'An admin cannot be blocked' },
    });
    expect(await store.block('admin')).toBe(false);
    expect(store.error()).toBe('An admin cannot be blocked');
    expect(store.saving()).toBe(false);
  });

  it('keeps a pilot on the list when unblocking fails', async () => {
    await store.load();
    api.fails = new Error('offline');
    expect(await store.unblock('u1')).toBe(false);
    expect(store.blocked()).toHaveLength(2);
    expect(store.error()).toBe('Could not unblock that pilot. Try again.');
  });
});

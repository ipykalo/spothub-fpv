import { Injector, runInInjectionContext } from '@angular/core';
import { RepairCause, type RepairDto } from '@spothub/shared';
import { type Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { RepairsApi } from './repairs.api';
import { RepairsStore } from './repairs.store';

/**
 * One build's crash log. Everything here follows the same shape as the other
 * hangar stores; the one rule of its own is that linking an install to a
 * repair re-reads the list rather than patching it, because the link changes
 * a count the server keeps (`installCount`), not a field the client sent.
 */
describe('RepairsStore', () => {
  const repair = (id: string, over: Partial<RepairDto> = {}): RepairDto => ({
    id,
    buildId: 'b1',
    occurredOn: '2026-02-01',
    cause: RepairCause.Crash,
    descriptionMd: null,
    cost: null,
    currency: null,
    installCount: 0,
    createdAt: '2026-02-01T00:00:00.000Z',
    ...over,
  });

  class FakeApi {
    calls: string[] = [];
    repairs: RepairDto[] = [repair('1'), repair('2')];
    listFails = false;
    removeFails = false;

    list(): Observable<RepairDto[]> {
      this.calls.push('list');

      return this.listFails
        ? throwError(() => new Error('offline'))
        : of([...this.repairs]);
    }

    create(): Observable<RepairDto> {
      return of(repair('3'));
    }

    remove(): Observable<void> {
      return this.removeFails ? throwError(() => new Error('nope')) : of(undefined);
    }

    linkInstall(): Observable<unknown> {
      this.calls.push('link');
      // The link is what changes the count, and only the server knows it.
      this.repairs = [repair('1', { installCount: 1 }), repair('2')];

      return of({});
    }
  }

  let api: FakeApi;
  let store: RepairsStore;

  beforeEach(() => {
    api = new FakeApi();
    const injector = Injector.create({
      providers: [{ provide: RepairsApi, useValue: api }],
    });

    store = runInInjectionContext(injector, () => new RepairsStore());
  });

  it('starts empty, and a quad that has never been repaired is not an error', () => {
    expect(store.repairs()).toEqual([]);
    expect(store.isEmpty()).toBe(true);
    expect(store.error()).toBeNull();
  });

  describe('loading', () => {
    it('fills the log', async () => {
      await store.load('b1');

      expect(store.repairs()).toHaveLength(2);
      expect(store.isEmpty()).toBe(false);
      expect(store.loading()).toBe(false);
    });

    it('says what went wrong rather than throwing at the page', async () => {
      api.listFails = true;

      await store.load('b1');

      expect(store.error()).toBe('Could not load the repair log.');
      expect(store.loading()).toBe(false);
    });
  });

  describe('writing', () => {
    it('puts a new repair first, newest first like the server’s own order', async () => {
      await store.load('b1');

      await store.create('b1', {} as never);

      expect(store.repairs().map((entry) => entry.id)).toEqual(['3', '1', '2']);
    });

    it('removes an entry at once, without waiting for the server', async () => {
      await store.load('b1');

      await store.remove('b1', '1');

      expect(store.repairs().map((entry) => entry.id)).toEqual(['2']);
    });

    it('puts it back when the delete fails', async () => {
      await store.load('b1');
      api.removeFails = true;

      await expect(store.remove('b1', '1')).rejects.toThrow();

      expect(store.repairs().map((entry) => entry.id)).toEqual(['1', '2']);
    });
  });

  describe('linking an install to a repair', () => {
    it('re-reads the log, since the link changes a count only the server keeps', async () => {
      await store.load('b1');

      await store.linkInstall('b1', 'i1', { repairId: '1' });

      expect(api.calls).toEqual(['list', 'link', 'list']);
      expect(store.repairs()[0].installCount).toBe(1);
    });
  });

  describe('reset', () => {
    it('empties it, so one build’s repairs never show under another', async () => {
      await store.load('b1');

      store.reset();

      expect(store.repairs()).toEqual([]);
      expect(store.error()).toBeNull();
    });
  });
});

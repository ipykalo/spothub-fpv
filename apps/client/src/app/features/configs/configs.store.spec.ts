import { Injector, runInInjectionContext } from '@angular/core';
import { type ConfigDto, ConfigKind, type ConfigWithRawDto } from '@spothub/shared';
import { type Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { ConfigsApi } from './configs.api';
import { ConfigsStore } from './configs.store';

/**
 * One build's firmware captures. The list is newest first, which is what lets
 * the first one stand for "what this quad is running now". The saved capture
 * comes back with its whole CLI dump attached, and the store deliberately
 * drops that: keeping a few hundred kilobytes of text per capture in memory
 * would cost more than re-reading the one being looked at.
 */
describe('ConfigsStore', () => {
  const config = (id: string, over: Partial<ConfigDto> = {}): ConfigDto => ({
    id,
    buildId: 'b1',
    capturedAt: '2026-01-01T00:00:00.000Z',
    kind: ConfigKind.Cli,
    note: null,
    fwTarget: 'STM32F7X2',
    fwVersion: '4.5.1',
    fwBuildDate: null,
    fwGitRev: null,
    mspApi: null,
    configRev: null,
    boardName: null,
    manufacturerId: null,
    mcuId: null,
    craftName: null,
    ...over,
  });

  class FakeApi {
    configs: ConfigDto[] = [
      config('new', { capturedAt: '2026-03-01T00:00:00.000Z', fwVersion: '4.5.2' }),
      config('old'),
    ];
    listFails = false;
    removeFails = false;

    list(): Observable<ConfigDto[]> {
      return this.listFails
        ? throwError(() => new Error('offline'))
        : of([...this.configs]);
    }

    create(): Observable<ConfigWithRawDto> {
      return of({ ...config('fresh'), raw: 'set motor_pwm_rate = 480\n'.repeat(500) });
    }

    remove(): Observable<void> {
      return this.removeFails ? throwError(() => new Error('nope')) : of(undefined);
    }
  }

  let api: FakeApi;
  let store: ConfigsStore;

  beforeEach(() => {
    api = new FakeApi();
    const injector = Injector.create({
      providers: [{ provide: ConfigsApi, useValue: api }],
    });

    store = runInInjectionContext(injector, () => new ConfigsStore());
  });

  it('starts empty, with nothing to call current', () => {
    expect(store.configs()).toEqual([]);
    expect(store.current()).toBeNull();
    expect(store.isEmpty()).toBe(true);
  });

  describe('loading', () => {
    it('fills the list and takes the newest as what the quad runs now', async () => {
      await store.load('b1');

      expect(store.configs()).toHaveLength(2);
      expect(store.current()?.fwVersion).toBe('4.5.2');
      expect(store.isEmpty()).toBe(false);
    });

    it('says what went wrong rather than throwing at the page', async () => {
      api.listFails = true;

      await store.load('b1');

      expect(store.error()).toBe('Could not load the firmware captures.');
      expect(store.loading()).toBe(false);
    });
  });

  describe('capturing', () => {
    it('puts the new capture first, so it becomes what the quad runs now', async () => {
      await store.load('b1');

      await store.create('b1', {} as never);

      expect(store.configs().map((entry) => entry.id)).toEqual(['fresh', 'new', 'old']);
      expect(store.current()?.id).toBe('fresh');
    });

    it('keeps the summary and not the dump, which the list never carries', async () => {
      await store.create('b1', {} as never);

      expect('raw' in store.configs()[0]).toBe(false);
    });
  });

  describe('removing', () => {
    it('takes the row away at once, without waiting for the server', async () => {
      await store.load('b1');

      await store.remove('b1', 'new');

      expect(store.configs().map((entry) => entry.id)).toEqual(['old']);
      expect(store.current()?.id).toBe('old');
    });

    it('puts it back when the delete fails', async () => {
      await store.load('b1');
      api.removeFails = true;

      await expect(store.remove('b1', 'new')).rejects.toThrow();

      expect(store.configs().map((entry) => entry.id)).toEqual(['new', 'old']);
    });
  });

  describe('reset', () => {
    it('empties it, so one build’s captures never show under another', async () => {
      api.listFails = true;
      await store.load('b1');

      store.reset();

      expect(store.configs()).toEqual([]);
      expect(store.error()).toBeNull();
    });
  });
});

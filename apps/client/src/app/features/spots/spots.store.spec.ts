import { Injector, runInInjectionContext } from '@angular/core';
import { SpotAccess, type SpotDto, Visibility } from '@spothub/shared';
import { type Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { SpotsApi } from './spots.api';
import { SpotsStore } from './spots.store';

/**
 * Where to fly: the viewer's own spots and the ones other pilots shared, kept
 * as two lists because only the first is ever written to. A failure on one
 * must not look like a failure on the other — the shared list is someone
 * else's and can be missing without the page being broken.
 */
describe('SpotsStore', () => {
  const spot = (id: string, over: Partial<SpotDto> = {}): SpotDto => ({
    id,
    name: `Spot ${id}`,
    slug: `spot-${id}`,
    lat: 50.45,
    lng: 30.52,
    locality: null,
    terrain: null,
    access: SpotAccess.Open,
    difficulty: null,
    hazards: [],
    descriptionMd: null,
    accessNotesMd: null,
    visibility: Visibility.Private,
    isDraft: false,
    video: null,
    coverUrl: null,
    ownedByViewer: true,
    ownerName: 'Ivan',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  });

  class FakeApi {
    own: SpotDto[] = [spot('1'), spot('2')];
    sharedSpots: SpotDto[] = [spot('9', { ownedByViewer: false, ownerName: 'Someone' })];
    fails = false;
    sharedFails = false;
    removeFails = false;

    list(): Observable<SpotDto[]> {
      return this.fails ? throwError(() => new Error('offline')) : of([...this.own]);
    }

    listShared(): Observable<SpotDto[]> {
      return this.sharedFails
        ? throwError(() => new Error('offline'))
        : of([...this.sharedSpots]);
    }

    create(input: { name: string }): Observable<SpotDto> {
      return of(spot('3', { name: input.name }));
    }

    createDraft(): Observable<SpotDto> {
      return of(spot('4', { name: 'Unnamed location', isDraft: true }));
    }

    update(id: string, input: { name?: string }): Observable<SpotDto> {
      return of(spot(id, { name: input.name ?? `Spot ${id}` }));
    }

    remove(): Observable<void> {
      return this.removeFails ? throwError(() => new Error('nope')) : of(undefined);
    }
  }

  let api: FakeApi;
  let store: SpotsStore;

  beforeEach(() => {
    api = new FakeApi();
    const injector = Injector.create({
      providers: [{ provide: SpotsApi, useValue: api }],
    });

    store = runInInjectionContext(injector, () => new SpotsStore());
  });

  it('starts empty and not loading', () => {
    expect(store.spots()).toEqual([]);
    expect(store.shared()).toEqual([]);
    expect(store.isEmpty()).toBe(true);
    expect(store.error()).toBeNull();
  });

  describe('loading', () => {
    it('fills the viewer’s own list and counts it', async () => {
      await store.load();

      expect(store.total()).toBe(2);
      expect(store.isEmpty()).toBe(false);
      expect(store.loading()).toBe(false);
    });

    it('says what went wrong rather than throwing at the page', async () => {
      api.fails = true;

      await store.load();

      expect(store.error()).toBe('Could not load your spots.');
      expect(store.loading()).toBe(false);
    });

    it('keeps the shared list apart from the viewer’s own', async () => {
      await store.loadShared();

      expect(store.shared()).toHaveLength(1);
      expect(store.spots()).toEqual([]);
      expect(store.sharedLoading()).toBe(false);
    });

    it('fails the two lists apart, so one missing does not break the page', async () => {
      api.sharedFails = true;

      await store.load();
      await store.loadShared();

      expect(store.sharedError()).toBe('Could not load the spots other pilots shared.');
      expect(store.error()).toBeNull();
      expect(store.spots()).toHaveLength(2);
    });
  });

  describe('writing', () => {
    it('puts a new spot at the top of the list', async () => {
      await store.load();

      const created = await store.create({ name: 'The field' } as never);

      expect(created.name).toBe('The field');
      expect(store.spots()[0]).toBe(created);
      expect(store.total()).toBe(3);
    });

    it('puts a spot captured from a GPS fix there too, still a draft', async () => {
      await store.load();

      const draft = await store.createDraft({} as never);

      expect(draft.isDraft).toBe(true);
      expect(store.spots()[0]).toBe(draft);
    });

    it('moves the spot it changed to the top, since that is the one being worked on', async () => {
      await store.load();

      await store.update('2', { name: 'Renamed' });

      expect(store.spots().map((entry) => entry.name)).toEqual(['Renamed', 'Spot 1']);
      expect(store.total()).toBe(2);
    });

    it('removes a spot at once, without waiting for the server', async () => {
      await store.load();

      await store.remove('1');

      expect(store.spots().map((entry) => entry.id)).toEqual(['2']);
    });

    it('puts the pin back when the delete fails, and lets the page know', async () => {
      await store.load();
      api.removeFails = true;

      await expect(store.remove('1')).rejects.toThrow();

      expect(store.spots().map((entry) => entry.id)).toEqual(['1', '2']);
    });
  });

  describe('find', () => {
    it('answers from either list, so opening a spot needs no request', async () => {
      await store.load();
      await store.loadShared();

      expect(store.find('1')?.ownedByViewer).toBe(true);
      expect(store.find('9')?.ownerName).toBe('Someone');
      expect(store.find('nope')).toBeUndefined();
    });
  });
});

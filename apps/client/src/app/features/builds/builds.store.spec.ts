import { Injector, runInInjectionContext } from '@angular/core';
import { BuildStatus, type BuildDto, Visibility } from '@spothub/shared';
import { type Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { BuildsApi } from './builds.api';
import { BuildsStore } from './builds.store';

/**
 * The hangar's state: the viewer's own builds and the ones other pilots
 * shared, kept apart because only the first is ever written to. The delete is
 * optimistic, so the interesting case is the one that fails.
 */
describe('BuildsStore', () => {
  const build = (id: string, over: Partial<BuildDto> = {}): BuildDto => ({
    id,
    name: `Build ${id}`,
    slug: `build-${id}`,
    buildClass: null,
    status: BuildStatus.Active,
    visibility: Visibility.Private,
    weightG: null,
    hasGps: false,
    shareCosts: false,
    shareNotes: false,
    descriptionMd: null,
    coverAssetId: null,
    coverUrl: null,
    builtOn: null,
    retiredOn: null,
    ownedByViewer: true,
    ownerName: 'Ivan',
    likes: { count: 0, likedByViewer: false },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  });

  class FakeApi {
    listed: unknown[] = [];
    own: BuildDto[] = [build('1'), build('2')];
    sharedBuilds: BuildDto[] = [build('9', { ownedByViewer: false })];
    fails = false;
    removeFails = false;

    list(query: unknown): Observable<BuildDto[]> {
      this.listed.push(query);

      return this.fails ? throwError(() => new Error('offline')) : of(this.own);
    }

    listShared(query: unknown): Observable<BuildDto[]> {
      this.listed.push(query);

      return this.fails ? throwError(() => new Error('offline')) : of(this.sharedBuilds);
    }

    create(input: { name: string }): Observable<BuildDto> {
      return of(build('3', { name: input.name }));
    }

    update(id: string, input: { name?: string }): Observable<BuildDto> {
      return of(build(id, { name: input.name ?? `Build ${id}` }));
    }

    remove(): Observable<void> {
      return this.removeFails ? throwError(() => new Error('nope')) : of(undefined);
    }

    getOne(id: string): Observable<BuildDto> {
      return of(build(id, { coverUrl: 'https://storage.invalid/cover.jpg' }));
    }
  }

  let api: FakeApi;
  let store: BuildsStore;

  beforeEach(() => {
    api = new FakeApi();
    const injector = Injector.create({
      providers: [{ provide: BuildsApi, useValue: api }],
    });

    store = runInInjectionContext(injector, () => new BuildsStore());
  });

  it('starts empty and not loading', () => {
    expect(store.builds()).toEqual([]);
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
    expect(store.isEmpty()).toBe(true);
  });

  describe('loading', () => {
    it('fills the list and counts it', async () => {
      await store.load();

      expect(store.builds()).toHaveLength(2);
      expect(store.total()).toBe(2);
      expect(store.isEmpty()).toBe(false);
      expect(store.loading()).toBe(false);
    });

    it('remembers the status filter and sends it on', async () => {
      await store.load(BuildStatus.Down);

      expect(store.status()).toBe(BuildStatus.Down);
      expect(api.listed.at(-1)).toEqual({ status: BuildStatus.Down });
    });

    it('reuses the remembered filter when asked again with nothing', async () => {
      await store.load(BuildStatus.Down);
      await store.load();

      expect(api.listed.at(-1)).toEqual({ status: BuildStatus.Down });
    });

    it('says what went wrong rather than throwing at the page', async () => {
      api.fails = true;

      await store.load();

      expect(store.error()).toBe('Could not load your builds.');
      expect(store.loading()).toBe(false);
    });

    it('keeps the shared list, its loading and its error apart from the viewer’s own', async () => {
      await store.loadShared();

      expect(store.shared()).toHaveLength(1);
      expect(store.builds()).toEqual([]);

      api.fails = true;
      await store.loadShared();

      expect(store.sharedError()).toBe('Could not load the builds other pilots shared.');
      expect(store.error()).toBeNull();
    });
  });

  describe('writing', () => {
    it('puts a new build at the top of the list', async () => {
      await store.load();

      const created = await store.create({ name: 'Nazgul' } as never);

      expect(created.name).toBe('Nazgul');
      expect(store.builds()[0]).toBe(created);
      expect(store.builds()).toHaveLength(3);
    });

    it('replaces the build it changed, and leaves the others alone', async () => {
      await store.load();

      await store.update('2', { name: 'Renamed' });

      expect(store.builds().map((entry) => entry.name)).toEqual(['Build 1', 'Renamed']);
    });

    it('removes a build at once, without waiting for the server', async () => {
      await store.load();

      await store.remove('1');

      expect(store.builds().map((entry) => entry.id)).toEqual(['2']);
    });

    it('puts the build back when the delete fails, and lets the page know', async () => {
      await store.load();
      api.removeFails = true;

      await expect(store.remove('1')).rejects.toThrow();

      expect(store.builds().map((entry) => entry.id)).toEqual(['1', '2']);
    });
  });

  describe('refresh', () => {
    it('re-reads one build and replaces it in the list holding it', async () => {
      await store.load();

      await store.refresh('2');

      expect(store.builds()[1]?.coverUrl).toBe('https://storage.invalid/cover.jpg');
      expect(store.builds()[0]?.coverUrl).toBeNull();
    });

    it('replaces it in the shared list too, when that is where it sits', async () => {
      await store.loadShared();

      await store.refresh('9');

      expect(store.shared()[0]?.coverUrl).toBe('https://storage.invalid/cover.jpg');
    });

    it('adds nothing to a list that did not hold it', async () => {
      await store.load();

      await store.refresh('9');

      expect(store.builds().map((entry) => entry.id)).toEqual(['1', '2']);
    });
  });

  describe('find', () => {
    it('answers from either list, so opening a build needs no request', async () => {
      await store.load();
      await store.loadShared();

      expect(store.find('1')?.name).toBe('Build 1');
      expect(store.find('9')?.ownedByViewer).toBe(false);
      expect(store.find('nope')).toBeUndefined();
    });
  });
});

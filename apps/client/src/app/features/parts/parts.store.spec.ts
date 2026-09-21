import { Injector, runInInjectionContext } from '@angular/core';
import {
  PartCategory,
  PartCondition,
  type PartDto,
  type PartUnitDto,
} from '@spothub/shared';
import { type Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { PartsApi } from './parts.api';
import { PartsStore } from './parts.store';

/**
 * The inventory's state. Two things are worth pinning down: the grouping by
 * category, which the shelf page is built on, and the rule that a write which
 * changes what a part is worth or what can be fitted re-reads that part rather
 * than patching the list from the response — a unit added by hand changes the
 * part's `fitted` and `units`, which only the server knows.
 */
describe('PartsStore', () => {
  const unit = (id: string, over: Partial<PartUnitDto> = {}): PartUnitDto => ({
    id,
    partId: 'p1',
    condition: PartCondition.Serviceable,
    label: null,
    acquiredOn: null,
    notes: null,
    fitted: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  });

  const part = (id: string, over: Partial<PartDto> = {}): PartDto => ({
    id,
    category: PartCategory.Motor,
    manufacturer: 'T-Motor',
    model: `Model ${id}`,
    spec: {},
    notesMd: null,
    units: [unit(`${id}-a`)],
    sources: [],
    purchasePrice: null,
    purchaseCurrency: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  });

  class FakeApi {
    queries: unknown[] = [];
    calls: string[] = [];
    parts: PartDto[] = [
      part('1'),
      part('2', {
        category: PartCategory.Propeller,
        units: [unit('2-a', { fitted: true })],
      }),
      part('3'),
    ];
    /** What `getOne` answers: a re-read is meant to bring back new facts. */
    reread: PartDto = part('1', {
      units: [unit('1-a'), unit('1-b')],
      purchasePrice: 12.5,
    });
    fails = false;
    removeFails = false;

    list(query: unknown): Observable<PartDto[]> {
      this.queries.push(query);

      return this.fails ? throwError(() => new Error('offline')) : of(this.parts);
    }

    getOne(): Observable<PartDto> {
      this.calls.push('getOne');

      return of(this.reread);
    }

    create(): Observable<PartDto> {
      return of(part('4'));
    }

    update(id: string): Observable<PartDto> {
      return of(part(id, { model: 'Renamed' }));
    }

    remove(): Observable<void> {
      return this.removeFails ? throwError(() => new Error('nope')) : of(undefined);
    }

    addSource(): Observable<unknown> {
      this.calls.push('addSource');

      return of({});
    }

    updateSource(): Observable<unknown> {
      this.calls.push('updateSource');

      return of({});
    }

    removeSource(): Observable<void> {
      this.calls.push('removeSource');

      return of(undefined);
    }

    addUnit(): Observable<unknown> {
      this.calls.push('addUnit');

      return of({});
    }

    updateUnit(): Observable<unknown> {
      this.calls.push('updateUnit');

      return of({});
    }

    removeUnit(): Observable<void> {
      this.calls.push('removeUnit');

      return of(undefined);
    }
  }

  let api: FakeApi;
  let store: PartsStore;

  beforeEach(() => {
    api = new FakeApi();
    const injector = Injector.create({
      providers: [{ provide: PartsApi, useValue: api }],
    });

    store = runInInjectionContext(injector, () => new PartsStore());
  });

  it('starts empty, and an empty shelf is not an error', () => {
    expect(store.parts()).toEqual([]);
    expect(store.isEmpty()).toBe(true);
    expect(store.error()).toBeNull();
  });

  describe('loading', () => {
    it('fills the shelf', async () => {
      await store.load();

      expect(store.total()).toBe(3);
      expect(store.isEmpty()).toBe(false);
      expect(store.loading()).toBe(false);
    });

    it('sends only the filters that are set, and remembers them', async () => {
      await store.load(PartCategory.Motor, PartCondition.Broken);

      expect(api.queries.at(-1)).toEqual({
        category: PartCategory.Motor,
        condition: PartCondition.Broken,
      });
      expect(store.category()).toBe(PartCategory.Motor);
      expect(store.condition()).toBe(PartCondition.Broken);

      await store.load(null, null);

      // Not `{ category: null }`: an absent filter is absent from the query.
      expect(api.queries.at(-1)).toEqual({});
    });

    it('reuses the remembered filters when asked again with nothing', async () => {
      await store.load(PartCategory.Motor, PartCondition.Serviceable);
      await store.load();

      expect(api.queries.at(-1)).toEqual({
        category: PartCategory.Motor,
        condition: PartCondition.Serviceable,
      });
    });

    it('says what went wrong rather than throwing at the page', async () => {
      api.fails = true;

      await store.load();

      expect(store.error()).toBe('Could not load your parts.');
      expect(store.loading()).toBe(false);
    });
  });

  describe('counting', () => {
    it('counts units held and units on a quad, not parts', async () => {
      await store.load();

      expect(store.total()).toBe(3);
      expect(store.unitTotal()).toBe(3);
      expect(store.fittedTotal()).toBe(1);
    });

    it('offers only parts with a unit free to fit', async () => {
      await store.load();

      // Part 2's only unit is already on a quad.
      expect(store.fittable().map((entry) => entry.id)).toEqual(['1', '3']);
    });
  });

  describe('grouping', () => {
    it('gathers a category under one heading, in the order the API sent them', async () => {
      await store.load();

      const groups = store.groups();

      expect(groups.map((group) => group.category)).toEqual([
        PartCategory.Motor,
        PartCategory.Propeller,
      ]);
      expect(groups[0].parts.map((entry) => entry.id)).toEqual(['1', '3']);
    });

    it('carries the heading and icon, so no template maps a category itself', async () => {
      await store.load();

      expect(store.groups()[0].label).toBeTruthy();
      expect(store.groups()[0].icon).toBeTruthy();
    });
  });

  describe('writing', () => {
    it('puts a new part at the top', async () => {
      await store.load();

      const created = await store.create({} as never);

      expect(store.parts()[0]).toBe(created);
      expect(store.total()).toBe(4);
    });

    it('replaces only the part it changed', async () => {
      await store.load();

      await store.update('2', {});

      expect(store.parts().map((entry) => entry.model)).toEqual([
        'Model 1',
        'Renamed',
        'Model 3',
      ]);
    });

    it('removes a part at once, without waiting for the server', async () => {
      await store.load();

      await store.remove('1');

      expect(store.parts().map((entry) => entry.id)).toEqual(['2', '3']);
    });

    it('puts the part back when the delete fails', async () => {
      await store.load();
      api.removeFails = true;

      await expect(store.remove('1')).rejects.toThrow();

      expect(store.parts().map((entry) => entry.id)).toEqual(['1', '2', '3']);
    });
  });

  describe('units and sources', () => {
    it('re-reads the part after a unit changes, since that changes what can be fitted', async () => {
      await store.load();

      await store.addUnit('1', {} as never);

      expect(api.calls).toEqual(['addUnit', 'getOne']);
      expect(store.find('1')?.units).toHaveLength(2);
    });

    it('does the same for changing and removing a unit', async () => {
      await store.load();

      await store.updateUnit('1', '1-a', {});
      await store.removeUnit('1', '1-a');

      expect(api.calls).toEqual(['updateUnit', 'getOne', 'removeUnit', 'getOne']);
    });

    it('re-reads the part after a source changes, since that changes its price', async () => {
      await store.load();

      await store.addSource('1', {} as never);

      expect(api.calls).toEqual(['addSource', 'getOne']);
      expect(store.find('1')?.purchasePrice).toBe(12.5);
    });

    it('does the same for correcting and removing a source', async () => {
      await store.load();

      await store.updateSource('1', 's1', {});
      await store.removeSource('1', 's1');

      expect(api.calls).toEqual(['updateSource', 'getOne', 'removeSource', 'getOne']);
    });

    it('leaves the list alone when the re-read is of a part it does not hold', async () => {
      await store.load();
      api.reread = part('99');

      await store.addUnit('99', {} as never);

      expect(store.parts().map((entry) => entry.id)).toEqual(['1', '2', '3']);
    });
  });

  describe('find', () => {
    it('answers from the loaded shelf, so opening a part needs no request', async () => {
      await store.load();

      expect(store.find('2')?.category).toBe(PartCategory.Propeller);
      expect(store.find('nope')).toBeUndefined();
    });
  });
});

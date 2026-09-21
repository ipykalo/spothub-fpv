import { Injector, runInInjectionContext } from '@angular/core';
import {
  type BuildCostDto,
  type BuildPartDto,
  InstallReason,
  PartCategory,
  PartCondition,
} from '@spothub/shared';
import { type Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { BuildPartsApi } from './build-parts.api';
import { BuildPartsStore } from './build-parts.store';

/**
 * What is bolted to one build. The store holds the whole history and derives
 * what is fitted from it, so removing a part moves it between two lists on
 * screen without another round trip.
 *
 * The cost is the part worth being careful about: it is the owner's alone, so
 * a page that does not yet know whose build it is asks for the list without
 * it — and must not leave the previous build's total on screen underneath.
 */
describe('BuildPartsStore', () => {
  const install = (id: string, over: Partial<BuildPartDto> = {}): BuildPartDto => ({
    id,
    buildId: 'b1',
    unitId: `u-${id}`,
    position: null,
    installedOn: '2026-01-01',
    removedOn: null,
    reason: InstallReason.Initial,
    repairId: null,
    unit: {
      id: `u-${id}`,
      partId: `p-${id}`,
      condition: PartCondition.Serviceable,
      label: null,
      acquiredOn: null,
      notes: null,
      fitted: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    part: {
      id: `p-${id}`,
      category: PartCategory.Motor,
      manufacturer: null,
      model: `Part ${id}`,
      spec: {},
      notesMd: null,
      units: [],
      sources: [],
      purchasePrice: null,
      purchaseCurrency: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    ...over,
  });

  const cost = (over: Partial<BuildCostDto> = {}): BuildCostDto => ({
    totals: [{ currency: 'EUR', amount: 120 }],
    unpricedCount: 1,
    installedCount: 2,
    repairTotals: [],
    repairCount: 0,
    ...over,
  });

  class FakeApi {
    calls: string[] = [];
    installs: BuildPartDto[] = [install('1'), install('2', { removedOn: '2026-02-01' })];
    rollup: BuildCostDto = cost();
    listFails = false;
    costFails = false;

    list(buildId: string): Observable<BuildPartDto[]> {
      this.calls.push(`list:${buildId}`);

      return this.listFails
        ? throwError(() => new Error('offline'))
        : of([...this.installs]);
    }

    cost(buildId: string): Observable<BuildCostDto> {
      this.calls.push(`cost:${buildId}`);

      return this.costFails ? throwError(() => new Error('not yours')) : of(this.rollup);
    }

    install(): Observable<BuildPartDto> {
      return of(install('3'));
    }

    remove(buildId: string, installId: string): Observable<BuildPartDto> {
      return of(install(installId, { removedOn: '2026-03-01' }));
    }
  }

  let api: FakeApi;
  let store: BuildPartsStore;

  beforeEach(() => {
    api = new FakeApi();
    const injector = Injector.create({
      providers: [{ provide: BuildPartsApi, useValue: api }],
    });

    store = runInInjectionContext(injector, () => new BuildPartsStore());
  });

  it('starts empty, with nothing spent', () => {
    expect(store.installs()).toEqual([]);
    expect(store.isEmpty()).toBe(true);
    expect(store.cost()).toMatchObject({ totals: [], installedCount: 0 });
  });

  describe('loading', () => {
    it('reads the history and the cost together', async () => {
      await store.load('b1');

      expect(api.calls).toEqual(['list:b1', 'cost:b1']);
      expect(store.installs()).toHaveLength(2);
      expect(store.cost().totals).toEqual([{ currency: 'EUR', amount: 120 }]);
    });

    it('splits the history into what is on the quad and what came off it', async () => {
      await store.load('b1');

      expect(store.fitted().map((entry) => entry.id)).toEqual(['1']);
      expect(store.removed().map((entry) => entry.id)).toEqual(['2']);
    });

    it('leaves the cost alone when the page may not see it', async () => {
      await store.load('b1', { withCost: false });

      expect(api.calls).toEqual(['list:b1']);
      expect(store.installs()).toHaveLength(2);
      expect(store.cost().totals).toEqual([]);
    });

    it('never leaves the last build’s total under a build whose cost is not shown', async () => {
      await store.load('b1');

      await store.load('b2', { withCost: false });

      expect(store.cost().installedCount).toBe(0);
    });

    it('says what went wrong rather than throwing at the page', async () => {
      api.listFails = true;

      await store.load('b1');

      expect(store.error()).toBe('Could not load the components on this build.');
      expect(store.loading()).toBe(false);
    });
  });

  describe('fitting and removing', () => {
    it('puts a newly fitted part at the top and re-reads what it cost', async () => {
      await store.load('b1');

      await store.install('b1', {} as never);

      expect(store.installs()[0].id).toBe('3');
      expect(store.fitted().map((entry) => entry.id)).toEqual(['3', '1']);
      expect(api.calls.at(-1)).toBe('cost:b1');
    });

    it('closes the install in place, so it moves lists without another read', async () => {
      await store.load('b1');

      await store.remove('b1', '1', {} as never);

      expect(store.installs()).toHaveLength(2);
      expect(store.fitted()).toEqual([]);
      expect(store.removed().map((entry) => entry.id)).toEqual(['1', '2']);
    });

    it('keeps a stale total rather than showing an error when the rollup fails', async () => {
      await store.load('b1');
      api.costFails = true;

      await store.install('b1', {} as never);

      expect(store.error()).toBeNull();
      expect(store.cost().totals).toEqual([{ currency: 'EUR', amount: 120 }]);
      expect(store.installs()[0].id).toBe('3');
    });
  });

  describe('reset', () => {
    it('empties everything, so one build’s parts never appear under another', async () => {
      await store.load('b1');

      store.reset();

      expect(store.installs()).toEqual([]);
      expect(store.cost().totals).toEqual([]);
      expect(store.error()).toBeNull();
      expect(store.isEmpty()).toBe(true);
    });
  });
});

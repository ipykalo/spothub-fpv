import type { BuildCostDto, BuildDto, BuildPartDto, PartDto } from '@spothub/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type TestApp, createTestApp } from './support/app';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

/**
 * A quad bought ready-made: paid for once, as a whole. Its price is where the
 * cost starts, the parts it came with are inside that price, and what is
 * fitted later adds its own. The tests run in order on one build.
 */
describe('bought builds', () => {
  let testApp: TestApp;
  let owner: TestUser;
  let pilot: TestUser;
  let build: BuildDto;

  beforeAll(async () => {
    testApp = await createTestApp();
    owner = await createTestUser(testApp.app, 'bought-owner');
    pilot = await createTestUser(testApp.app, 'bought-pilot');
  });

  afterAll(async () => {
    await deleteTestUser(testApp.app, owner.id);
    await deleteTestUser(testApp.app, pilot.id);
    await testApp.close();
  });

  const as = (user: TestUser): string => `Bearer ${user.accessToken}`;

  async function postAs<T>(user: TestUser, path: string, body: object): Promise<T> {
    const response = await request(testApp.server)
      .post(path)
      .set('Authorization', as(user))
      .send(body)
      .expect((res) => {
        if (res.status >= 300) {
          throw new Error(
            `POST ${path} answered ${String(res.status)}: ${JSON.stringify(res.body)}`,
          );
        }
      });

    return response.body as T;
  }

  const patchBuild = (body: object): request.Test =>
    request(testApp.server)
      .patch(`/api/builds/${build.id}`)
      .set('Authorization', as(owner))
      .send(body);

  async function cost(user: TestUser = owner): Promise<BuildCostDto> {
    const response = await request(testApp.server)
      .get(`/api/builds/${build.id}/parts/cost`)
      .set('Authorization', as(user))
      .expect(200);
    return response.body as BuildCostDto;
  }

  /** A part with one unit, bought for `price` EUR when given, fitted for `reason`. */
  async function fit(
    category: string,
    reason: 'INITIAL' | 'REPLACEMENT' | 'UPGRADE',
    price: number | null,
  ): Promise<void> {
    const part = await postAs<PartDto>(owner, '/api/parts', {
      category,
      manufacturer: 'GEPRC',
      quantity: 1,
    });

    if (price !== null) {
      await postAs(owner, `/api/parts/${part.id}/sources`, {
        price,
        currency: 'EUR',
        isPurchase: true,
      });
    }

    await postAs(owner, `/api/builds/${build.id}/parts`, {
      unitId: part.units[0].id,
      installedOn: '2026-04-10',
      reason,
    });
  }

  it('records what the quad cost as a whole, and where it came from', async () => {
    build = await postAs<BuildDto>(owner, '/api/builds', {
      name: 'Cinelog 20',
      visibility: 'PUBLIC',
      boughtComplete: true,
      purchasePrice: '219.99',
      purchaseCurrency: 'usd',
      purchaseVendor: 'GEPRC',
      purchaseUrl: 'https://geprc.com/product/geprc-cinelog20-analog-fpv-drone/',
      builtOn: '2026-04-01',
    });

    expect(build).toMatchObject({
      boughtComplete: true,
      purchasePrice: 219.99,
      purchaseCurrency: 'USD',
      purchaseVendor: 'GEPRC',
      purchaseUrl: 'https://geprc.com/product/geprc-cinelog20-analog-fpv-drone/',
      builtOn: '2026-04-01',
    });
  });

  it('refuses a price with no currency, which could not be added to anything', async () => {
    await request(testApp.server)
      .post('/api/builds')
      .set('Authorization', as(owner))
      .send({ name: 'No currency', boughtComplete: true, purchasePrice: 100 })
      .expect(400);
  });

  it('starts the cost from the quad’s price, with the parts it came with inside it', async () => {
    await fit('FRAME', 'INITIAL', null);
    // A stock part that happens to carry a price must not be counted twice.
    await fit('FC', 'INITIAL', 40);

    expect(await cost()).toMatchObject({
      totals: [{ currency: 'USD', amount: 219.99 }],
      boughtFor: { currency: 'USD', amount: 219.99 },
      stockCount: 2,
      unpricedCount: 0,
      installedCount: 2,
    });
  });

  it('adds what was fitted since, as a replacement or an upgrade', async () => {
    await fit('MOTOR', 'REPLACEMENT', 15);
    await fit('PROP', 'UPGRADE', null);

    expect(await cost()).toMatchObject({
      totals: [
        { currency: 'USD', amount: 219.99 },
        { currency: 'EUR', amount: 15 },
      ],
      stockCount: 2,
      unpricedCount: 1,
      installedCount: 4,
    });
  });

  it('a built quad has no price of its own, and every part counts', async () => {
    await patchBuild({ boughtComplete: false }).expect(200);

    expect(await cost()).toMatchObject({
      totals: [{ currency: 'EUR', amount: 55 }],
      boughtFor: null,
      stockCount: 0,
      unpricedCount: 2,
    });

    await patchBuild({ boughtComplete: true }).expect(200);
  });

  it('shows another pilot that it was bought, but not for how much unless costs are shared', async () => {
    const hidden = (
      await request(testApp.server)
        .get(`/api/builds/${build.id}`)
        .set('Authorization', as(pilot))
        .expect(200)
    ).body as BuildDto;

    expect(hidden).toMatchObject({
      boughtComplete: true,
      purchasePrice: null,
      purchaseCurrency: null,
      purchaseVendor: null,
      purchaseUrl: null,
    });

    await patchBuild({ shareCosts: true }).expect(200);

    const shown = (
      await request(testApp.server)
        .get(`/api/builds/${build.id}`)
        .set('Authorization', as(pilot))
        .expect(200)
    ).body as BuildDto;

    expect(shown).toMatchObject({ purchasePrice: 219.99, purchaseVendor: 'GEPRC' });
    expect((await cost(pilot)).boughtFor).toEqual({ currency: 'USD', amount: 219.99 });
  });

  describe('the parts it came with, in one go', () => {
    const stock = {
      installedOn: '2026-04-01',
      parts: [
        { category: 'MOTOR', manufacturer: 'GEPRC', model: 'SpeedX2 1303.5', count: 4 },
        { category: 'VTX', manufacturer: 'RushFPV', model: 'RAD Mini 1W' },
      ],
    };

    const partCount = (user: TestUser): Promise<number> =>
      request(testApp.server)
        .get('/api/parts')
        .set('Authorization', as(user))
        .expect(200)
        .then((response) => (response.body as PartDto[]).length);

    it('creates each part with its units and fits every unit as what it came with', async () => {
      const before = await cost();

      const fitted = (
        await request(testApp.server)
          .post(`/api/builds/${build.id}/parts/stock`)
          .set('Authorization', as(owner))
          .send(stock)
          .expect(201)
      ).body as BuildPartDto[];

      expect(fitted).toHaveLength(5);
      expect(fitted.every((install) => install.reason === 'INITIAL')).toBe(true);
      expect(fitted.filter((install) => install.part.category === 'MOTOR')).toHaveLength(
        4,
      );
      // Four units of one part, not four parts.
      expect(new Set(fitted.map((install) => install.part.id)).size).toBe(2);

      const after = await cost();
      expect(after.stockCount).toBe(before.stockCount + 5);
      expect(after.unpricedCount).toBe(before.unpricedCount);
      expect(after.totals).toEqual(before.totals);
    });

    it('creates nothing on a build that is not the asker’s', async () => {
      const before = await partCount(pilot);

      await request(testApp.server)
        .post(`/api/builds/${build.id}/parts/stock`)
        .set('Authorization', as(pilot))
        .send(stock)
        .expect(404);

      expect(await partCount(pilot)).toBe(before);
    });

    it('refuses an empty list', async () => {
      await request(testApp.server)
        .post(`/api/builds/${build.id}/parts/stock`)
        .set('Authorization', as(owner))
        .send({ installedOn: '2026-04-01', parts: [] })
        .expect(400);
    });
  });
});

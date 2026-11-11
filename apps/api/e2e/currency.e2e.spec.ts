import type { BuildDto, CurrentUserDto, PartDto, RepairDto } from '@spothub/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type TestApp, createTestApp } from './support/app';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

/**
 * Prices are in a currency from the list, so every one can be converted into
 * a total; a typo is refused rather than becoming a currency of its own.
 */
describe('currencies', () => {
  let testApp: TestApp;
  let pilot: TestUser;

  beforeAll(async () => {
    testApp = await createTestApp();
    pilot = await createTestUser(testApp.app, 'currency-pilot');
  });

  afterAll(async () => {
    await deleteTestUser(testApp.app, pilot.id);
    await testApp.close();
  });

  const post = (path: string, body: object): request.Test =>
    request(testApp.server)
      .post(path)
      .set('Authorization', `Bearer ${pilot.accessToken}`)
      .send(body);

  it('takes a listed currency in any case, and refuses one that is not listed', async () => {
    const part = await post('/api/parts', { name: 'Priced motor', category: 'MOTOR' });
    const partId = (part.body as PartDto).id;

    const priced = await post(`/api/parts/${partId}/sources`, {
      price: 12.5,
      currency: 'pln',
    });
    expect(priced.status).toBe(201);

    for (const currency of ['EUE', 'XAU', 'BRL', 'DOLLARS']) {
      const refused = await post(`/api/parts/${partId}/sources`, { price: 1, currency });
      expect(refused.status, currency).toBe(400);
    }

    const parts = await request(testApp.server)
      .get(`/api/parts/${partId}`)
      .set('Authorization', `Bearer ${pilot.accessToken}`);
    expect((parts.body as PartDto).sources.map((source) => source.currency)).toEqual([
      'PLN',
    ]);
  });

  it('holds a repair and a bought quad to the same list', async () => {
    const build = await post('/api/builds', {
      name: 'Bought in hryvnias',
      boughtComplete: true,
      purchasePrice: 9800,
      purchaseCurrency: 'uah',
    });
    expect(build.status).toBe(201);
    expect((build.body as BuildDto).purchaseCurrency).toBe('UAH');

    const typo = await post('/api/builds', {
      name: 'Typo',
      boughtComplete: true,
      purchasePrice: 100,
      purchaseCurrency: 'USS',
    });
    expect(typo.status).toBe(400);

    const buildId = (build.body as BuildDto).id;
    const repair = await post(`/api/builds/${buildId}/repairs`, {
      occurredOn: '2026-11-01',
      cost: 450,
      currency: 'UAH',
    });
    expect(repair.status).toBe(201);
    expect((repair.body as RepairDto).currency).toBe('UAH');

    const bad = await post(`/api/builds/${buildId}/repairs`, {
      occurredOn: '2026-11-01',
      cost: 1,
      currency: 'ABC',
    });
    expect(bad.status).toBe(400);
  });

  it('keeps each pilot’s home currency, USD until they choose', async () => {
    const me = (): Promise<CurrentUserDto> =>
      request(testApp.server)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${pilot.accessToken}`)
        .then((response) => response.body as CurrentUserDto);

    expect((await me()).homeCurrency).toBe('USD');

    const saved = await request(testApp.server)
      .patch('/api/users/me/currency')
      .set('Authorization', `Bearer ${pilot.accessToken}`)
      .send({ homeCurrency: 'uah' });
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({ homeCurrency: 'UAH' });
    expect((await me()).homeCurrency).toBe('UAH');

    const refused = await request(testApp.server)
      .patch('/api/users/me/currency')
      .set('Authorization', `Bearer ${pilot.accessToken}`)
      .send({ homeCurrency: 'XYZ' });
    expect(refused.status).toBe(400);
  });
});

import type { BuildCostDto, BuildDto, PartDto } from '@spothub/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../src/prisma';
import { type TestApp, createTestApp } from './support/app';
import { StubRateSource } from './support/stub-rate-source';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

/**
 * A build's cost added up into one number in the viewer's currency and in
 * USD, each price at the rate of the day it was paid — next to what was
 * paid, which stays as it was.
 */
describe('converted cost totals', () => {
  let testApp: TestApp;
  let owner: TestUser;
  let build: BuildDto;

  const BOUGHT_ON = '2026-04-01';
  const PART_ON = '2026-04-10';
  const REPAIR_ON = '2026-04-20';
  const days = [BOUGHT_ON, PART_ON, REPAIR_ON].map((day) => new Date(`${day}T00:00:00.000Z`));

  const send = async <T>(method: 'get' | 'post' | 'patch', path: string, body?: object): Promise<T> => {
    const call = request(testApp.server)[method](path).set('Authorization', `Bearer ${owner.accessToken}`);
    const response = await (body ? call.send(body) : call);
    expect(response.status, `${method.toUpperCase()} ${path}`).toBeLessThan(300);
    return response.body as T;
  };

  beforeAll(async () => {
    testApp = await createTestApp();
    owner = await createTestUser(testApp.app, 'converted-owner');
    await testApp.app.get(PrismaService).exchangeRate.deleteMany({ where: { day: { in: days } } });

    await send('patch', '/api/users/me/currency', { homeCurrency: 'UAH' });

    // Bought for ₴8,000, a $50 motor fitted since, and a €20 repair.
    build = await send<BuildDto>('post', '/api/builds', {
      name: 'Converted quad',
      boughtComplete: true,
      purchasePrice: 8000,
      purchaseCurrency: 'UAH',
      builtOn: BOUGHT_ON,
    });

    const part = await send<PartDto>('post', '/api/parts', { name: 'Upgrade motor', category: 'MOTOR' });
    await send('post', `/api/parts/${part.id}/sources`, {
      price: 50,
      currency: 'USD',
      isPurchase: true,
      purchasedOn: PART_ON,
    });
    const [unit] = (await send<PartDto>('get', `/api/parts/${part.id}`)).units;
    await send('post', `/api/builds/${build.id}/parts`, {
      unitId: unit.id,
      installedOn: PART_ON,
      reason: 'UPGRADE',
    });

    await send('post', `/api/builds/${build.id}/repairs`, {
      occurredOn: REPAIR_ON,
      cost: 20,
      currency: 'EUR',
    });
  });

  afterAll(async () => {
    await deleteTestUser(testApp.app, owner.id);
    await testApp.app.get(PrismaService).exchangeRate.deleteMany({ where: { day: { in: days } } });
    await testApp.close();
  });

  const cost = (): Promise<BuildCostDto> => send<BuildCostDto>('get', `/api/builds/${build.id}/parts/cost`);

  it('adds every price up at its own day’s rate, in the viewer’s currency and USD', async () => {
    // The first look queues the three days; once fetched, the totals are exact.
    await cost();
    await vi.waitFor(async () => {
      const latest = await cost();
      expect(latest.converted.totals.every((total) => total.exact)).toBe(true);
      expect(latest.converted.repairTotals.every((total) => total.exact)).toBe(true);
    }, { timeout: 20_000, interval: 300 });

    const result = await cost();

    // What was paid stays as it was paid.
    expect(result.totals).toEqual(
      expect.arrayContaining([
        { currency: 'UAH', amount: 8000 },
        { currency: 'USD', amount: 50 },
      ]),
    );

    const usdOnPart = StubRateSource.usdOn(PART_ON);
    const usdOnBuy = StubRateSource.usdOn(BOUGHT_ON);
    const expectedUah = 8000 + 50 * usdOnPart;
    const expectedUsd = 8000 / usdOnBuy + 50;

    expect(result.converted.totals.map((total) => total.currency)).toEqual(['UAH', 'USD']);
    expect(result.converted.totals[0].amount).toBe(Math.round(expectedUah * 100) / 100);
    expect(result.converted.totals[1].amount).toBe(Math.round(expectedUsd * 100) / 100);

    // €20 on the repair's day: a euro is 5 hryvnias above a dollar in the stub.
    const eurOnRepair = StubRateSource.usdOn(REPAIR_ON) + 5;
    expect(result.converted.repairTotals[0]).toMatchObject({
      currency: 'UAH',
      amount: 20 * eurOnRepair,
      exact: true,
      ratesOn: REPAIR_ON,
    });
  });

  it('gives a USD pilot one total, in USD', async () => {
    await send('patch', '/api/users/me/currency', { homeCurrency: 'USD' });
    // The access token carries no currency; the next request reads it afresh.
    const result = await cost();

    expect(result.converted.totals.map((total) => total.currency)).toEqual(['USD']);
  });
});

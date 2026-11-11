import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ExchangeRatesFacade } from '../src/exchange-rates';
import { PrismaService } from '../src/prisma';
import { type TestApp, createTestApp } from './support/app';
import { StubRateSource } from './support/stub-rate-source';

/**
 * A day's rates are fetched the first time a price dated that day is added
 * up, in the background, and kept; meanwhile the total uses the nearest day
 * stored and says it is approximate. No request ever waits on the bank.
 */
describe('exchange rates', () => {
  let testApp: TestApp;
  const DAYS = ['2026-03-01', '2026-03-05'];

  const facade = (): ExchangeRatesFacade => testApp.app.get(ExchangeRatesFacade);
  const prisma = (): PrismaService => testApp.app.get(PrismaService);
  const dates = DAYS.map((day) => new Date(`${day}T00:00:00.000Z`));

  beforeAll(async () => {
    testApp = await createTestApp();
    // These two days only, so each run fetches them afresh.
    await prisma().exchangeRate.deleteMany({ where: { day: { in: dates } } });
  });

  afterAll(async () => {
    await prisma().exchangeRate.deleteMany({ where: { day: { in: dates } } });
    await testApp.close();
  });

  const storedFor = (day: string): Promise<number> =>
    prisma().exchangeRate.count({ where: { day: new Date(`${day}T00:00:00.000Z`) } });

  it('fetches a day the first time it is needed, once, and converts at it from then on', async () => {
    const [day] = DAYS;
    const asked = StubRateSource.asked.length;
    const amounts = [{ amount: 100, currency: 'USD', day }];

    // Twice at once: the day is queued once.
    await Promise.all([
      facade().totals(amounts, ['UAH']),
      facade().totals(amounts, ['UAH']),
    ]);

    await vi.waitFor(
      async () => {
        expect(await storedFor(day)).toBe(3);
      },
      { timeout: 15_000, interval: 200 },
    );

    expect(
      StubRateSource.asked.slice(asked).filter((entry) => entry === day),
    ).toHaveLength(1);

    const [total] = await facade().totals(amounts, ['UAH']);
    expect(total).toEqual({
      currency: 'UAH',
      amount: 100 * StubRateSource.usdOn(day),
      exact: true,
      ratesOn: day,
    });
  });

  it('converts a day not fetched yet with the nearest one stored, and says it is approximate', async () => {
    const [stored, later] = DAYS;
    const [total] = await facade().totals(
      [{ amount: 10, currency: 'USD', day: later }],
      ['UAH'],
    );

    // 2026-03-01 is stored by now; 2026-03-05 is not, until its job runs.
    expect(total.exact).toBe(false);
    expect(total.amount).toBe(10 * StubRateSource.usdOn(stored));

    await vi.waitFor(
      async () => {
        expect(await storedFor(later)).toBe(3);
      },
      { timeout: 15_000, interval: 200 },
    );

    const [exact] = await facade().totals(
      [{ amount: 10, currency: 'USD', day: later }],
      ['UAH'],
    );
    expect(exact).toMatchObject({
      amount: 10 * StubRateSource.usdOn(later),
      exact: true,
    });
  });

  it('adds up several currencies into several, through the hryvnia', async () => {
    const [day] = DAYS;
    const totals = await facade().totals(
      [
        { amount: 50, currency: 'USD', day },
        { amount: 1000, currency: 'UAH', day },
        { amount: 20, currency: 'PLN', day },
      ],
      ['UAH', 'USD'],
    );

    const usd = StubRateSource.usdOn(day);
    expect(totals[0].amount).toBe(50 * usd + 1000 + 20 * 10);
    expect(totals[1].amount).toBe(
      Math.round(((50 * usd + 1000 + 200) / usd) * 100) / 100,
    );
    expect(totals.every((total) => total.exact)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';

import {
  type RatesByDay,
  convertEach,
  convertTotal,
  daysNeeded,
  ratesFor,
} from './conversion';

/** Hryvnias per unit, as the NBU publishes them. */
const RATES: RatesByDay = new Map([
  [
    '2025-01-01',
    new Map([
      ['USD', 42.0295],
      ['EUR', 43.6855],
      ['PLN', 10.218],
    ]),
  ],
  [
    '2026-11-08',
    new Map([
      ['USD', 45.4432],
      ['EUR', 51.0406],
      ['PLN', 11.6239],
    ]),
  ],
]);

describe('convertTotal', () => {
  it('converts each price at its own day’s rate, through the hryvnia', () => {
    const total = convertTotal(
      [
        { amount: 100, currency: 'USD', day: '2025-01-01' },
        { amount: 100, currency: 'USD', day: '2026-11-08' },
      ],
      'UAH',
      RATES,
    );

    expect(total).toEqual({
      currency: 'UAH',
      amount: 8747.27,
      exact: true,
      ratesOn: '2026-11-08',
    });
  });

  it('goes from one foreign currency to another', () => {
    const total = convertTotal(
      [{ amount: 20, currency: 'EUR', day: '2026-11-08' }],
      'USD',
      RATES,
    );

    // 20 × 51.0406 / 45.4432
    expect(total.amount).toBe(22.46);
    expect(total.exact).toBe(true);
  });

  it('adds what is already in the target currency as it is, needing no rate', () => {
    const total = convertTotal(
      [
        { amount: 2580, currency: 'UAH', day: '2030-01-01' },
        { amount: 10, currency: 'USD', day: '2026-11-08' },
      ],
      'UAH',
      RATES,
    );

    expect(total.amount).toBe(3034.43);
    expect(total.exact).toBe(true);
  });

  it('uses the nearest earlier day for a day not fetched yet, and says it is approximate', () => {
    const total = convertTotal(
      [{ amount: 10, currency: 'USD', day: '2026-11-10' }],
      'UAH',
      RATES,
    );

    expect(total).toEqual({
      currency: 'UAH',
      amount: 454.43,
      exact: false,
      ratesOn: '2026-11-08',
    });
  });

  it('has no total when a currency has no rate at all', () => {
    const total = convertTotal(
      [{ amount: 5, currency: 'INR', day: '2026-11-08' }],
      'UAH',
      RATES,
    );

    expect(total.amount).toBeNull();
    expect(
      convertTotal([{ amount: 5, currency: 'USD', day: '2026-11-08' }], 'UAH', new Map())
        .amount,
    ).toBeNull();
  });

  it('is zero for nothing to add', () => {
    expect(convertTotal([], 'USD', RATES)).toEqual({
      currency: 'USD',
      amount: 0,
      exact: true,
      ratesOn: null,
    });
  });
});

describe('convertEach', () => {
  it('converts each price on its own, at its own day’s rate, and keeps one in its own currency as it is', () => {
    const [dollars, hryvnias] = convertEach(
      [
        { amount: 100, currency: 'USD', day: '2025-01-01' },
        { amount: 4544.32, currency: 'UAH', day: '2026-11-08' },
      ],
      ['UAH', 'USD'],
      RATES,
    );

    expect(dollars).toEqual([
      { currency: 'UAH', amount: 4202.95, exact: true, ratesOn: '2025-01-01' },
      { currency: 'USD', amount: 100, exact: true, ratesOn: null },
    ]);
    expect(hryvnias).toEqual([
      { currency: 'UAH', amount: 4544.32, exact: true, ratesOn: null },
      { currency: 'USD', amount: 100, exact: true, ratesOn: '2026-11-08' },
    ]);
  });

  it('answers nothing for no prices', () => {
    expect(convertEach([], ['USD'], RATES)).toEqual([]);
  });
});

describe('ratesFor', () => {
  it('prefers the day itself, then the latest before, then the earliest after', () => {
    expect(ratesFor('2025-01-01', RATES)).toEqual({ day: '2025-01-01', exact: true });
    expect(ratesFor('2026-01-01', RATES)).toEqual({ day: '2025-01-01', exact: false });
    expect(ratesFor('2020-01-01', RATES)).toEqual({ day: '2025-01-01', exact: false });
    expect(ratesFor('2020-01-01', new Map())).toBeNull();
  });
});

describe('daysNeeded', () => {
  it('lists the days a conversion needs, once each, and none for a price already in every target', () => {
    expect(
      daysNeeded(
        [
          { amount: 1, currency: 'USD', day: '2026-11-08' },
          { amount: 2, currency: 'EUR', day: '2026-11-08' },
          { amount: 3, currency: 'EUR', day: '2025-01-01' },
        ],
        ['UAH', 'USD'],
      ),
    ).toEqual(['2025-01-01', '2026-11-08']);

    expect(
      daysNeeded([{ amount: 1, currency: 'USD', day: '2026-11-08' }], ['USD']),
    ).toEqual([]);
  });
});

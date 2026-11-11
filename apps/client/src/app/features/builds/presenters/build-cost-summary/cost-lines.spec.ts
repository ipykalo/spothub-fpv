import type { ConvertedTotalDto } from '@spothub/shared';
import { describe, expect, it } from 'vitest';

import { costLines, formatMoney } from './cost-lines';

const total = (
  currency: string,
  amount: number | null,
  exact = true,
): ConvertedTotalDto => ({
  currency,
  amount,
  exact,
  ratesOn: amount === null ? null : '2026-11-08',
});

describe('formatMoney', () => {
  it('uses the currency’s own sign, and cents only when there are any', () => {
    expect(formatMoney(410.2, 'USD')).toBe('$410.20');
    expect(formatMoney(18640, 'UAH')).toBe('₴18,640');
    expect(formatMoney(12.5, 'EUR')).toBe('€12.50');
  });
});

describe('costLines', () => {
  it('leads with the totals in the viewer’s currency and USD, and shows what was paid under them', () => {
    const lines = costLines(
      [
        { currency: 'USD', amount: 388.5 },
        { currency: 'UAH', amount: 2580 },
      ],
      [total('UAH', 20235.32), total('USD', 445.28)],
    );

    expect(lines.headline).toEqual(['≈ ₴20,235.32', '≈ $445.28']);
    expect(lines.paidAs).toEqual(['$388.50', '₴2,580']);
    expect(lines.note).toBe('≈ converted at the exchange rate on each purchase date.');
  });

  it('needs no "≈" and no second line when everything was paid in a currency already shown', () => {
    const lines = costLines(
      [{ currency: 'USD', amount: 120 }],
      [total('UAH', 5000), total('USD', 120)],
    );

    expect(lines.headline).toEqual(['≈ ₴5,000', '$120']);
    expect(lines.paidAs).toEqual([]);
  });

  it('says no more than that it was converted, without naming a bank or a day', () => {
    const lines = costLines(
      [{ currency: 'EUR', amount: 10 }],
      [total('UAH', 510, false), total('USD', 11.2, false)],
    );

    expect(lines.note).toBe('≈ converted at the exchange rate on each purchase date.');
    expect(lines.note).not.toMatch(/NBU|fetched|\d{4}-\d{2}-\d{2}/);
  });

  it('says nothing about converting when nothing was', () => {
    const lines = costLines(
      [{ currency: 'USD', amount: 120 }],
      [{ currency: 'USD', amount: 120, exact: true, ratesOn: null }],
    );

    expect(lines.note).toBeNull();
  });

  it('falls back to what was paid when nothing could be converted yet', () => {
    const lines = costLines(
      [{ currency: 'EUR', amount: 10 }],
      [total('UAH', null), total('USD', null)],
    );

    expect(lines.headline).toEqual(['€10']);
    expect(lines.paidAs).toEqual([]);
    expect(lines.note).toBeNull();
  });

  it('shows nothing for nothing paid', () => {
    expect(costLines([], [total('UAH', 0)])).toEqual({
      headline: [],
      paidAs: [],
      note: null,
    });
  });
});

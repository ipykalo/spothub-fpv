import type { ConvertedTotalDto } from '@spothub/shared';
import { describe, expect, it } from 'vitest';

import { formatMoney, priceLine } from './money';

const converted = (currency: string, amount: number | null): ConvertedTotalDto => ({
  currency,
  amount,
  exact: true,
  ratesOn: '2026-11-08',
});

describe('formatMoney', () => {
  it('uses the currency’s own sign, with cents only when there are any', () => {
    expect(formatMoney(410.2, 'USD')).toBe('$410.20');
    expect(formatMoney(18640, 'UAH')).toBe('₴18,640');
    expect(formatMoney(12.5, 'EUR')).toBe('€12.50');
  });
});

describe('priceLine', () => {
  it('leads with what was paid, then the viewer’s currency and USD, each marked ≈', () => {
    expect(
      priceLine(30, 'EUR', [converted('UAH', 1531.22), converted('USD', 34.5)]),
    ).toEqual({ paid: '€30', approx: ['≈ ₴1,531.22', '≈ $34.50'] });
  });

  it('leaves out a conversion into the currency it was paid in', () => {
    expect(
      priceLine(5091.69, 'UAH', [converted('UAH', 5091.69), converted('USD', 112.04)]),
    ).toEqual({ paid: '₴5,091.69', approx: ['≈ $112.04'] });
  });

  it('shows only what was paid when nothing could be converted', () => {
    expect(priceLine(100, 'USD', [])).toEqual({ paid: '$100', approx: [] });
    expect(priceLine(100, 'EUR', [converted('UAH', null)])).toEqual({
      paid: '€100',
      approx: [],
    });
  });
});

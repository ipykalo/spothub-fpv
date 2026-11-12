import {
  type BuildPartDto,
  type ConvertedTotalDto,
  InstallReason,
  PartCategory,
  PartCondition,
  type PartSourceDto,
} from '@spothub/shared';
import { describe, expect, it } from 'vitest';

import { rowPrice } from './row-price';

const inDollars: ConvertedTotalDto = {
  currency: 'USD',
  amount: 34.5,
  exact: true,
  ratesOn: '2026-11-08',
};

const source = (over: Partial<PartSourceDto> = {}): PartSourceDto => ({
  id: 's1',
  partId: 'p1',
  vendor: 'Shop',
  url: null,
  price: 1450,
  currency: 'UAH',
  isPurchase: true,
  purchasedOn: '2026-11-08',
  quantity: 1,
  capturedAt: '2026-11-08T10:00:00.000Z',
  converted: [inDollars],
  ...over,
});

const install = (
  reason: InstallReason,
  price: number | null,
  sources: PartSourceDto[] = [],
): BuildPartDto => ({
  id: 'i1',
  buildId: 'b1',
  unitId: 'u1',
  position: null,
  installedOn: '2026-11-08',
  removedOn: null,
  reason,
  repairId: null,
  unit: {
    id: 'u1',
    partId: 'p1',
    condition: PartCondition.Serviceable,
    label: null,
    acquiredOn: null,
    notes: null,
    fitted: true,
    createdAt: '2026-11-08T10:00:00.000Z',
  },
  part: {
    id: 'p1',
    category: PartCategory.Motor,
    manufacturer: null,
    model: 'Motor',
    spec: {},
    notesMd: null,
    units: [],
    sources,
    purchasePrice: price,
    purchaseCurrency: price === null ? null : 'UAH',
    createdAt: '2026-11-08T10:00:00.000Z',
    updatedAt: '2026-11-08T10:00:00.000Z',
  },
});

describe('rowPrice', () => {
  it('shows what was paid, with the purchase’s conversions', () => {
    expect(rowPrice(install(InstallReason.Upgrade, 1450, [source()]), false)).toEqual({
      kind: 'paid',
      amount: 1450,
      currency: 'UAH',
      converted: [inDollars],
    });
  });

  it('calls a part a bought quad came with included, even when it has a price of its own', () => {
    expect(rowPrice(install(InstallReason.Initial, 1450, [source()]), true)).toEqual({
      kind: 'included',
    });
  });

  it('prices a first fitting on a quad that was built, not bought', () => {
    expect(rowPrice(install(InstallReason.Initial, 1450, [source()]), false).kind).toBe(
      'paid',
    );
  });

  it('prices a replacement on a bought quad', () => {
    expect(
      rowPrice(install(InstallReason.Replacement, 1450, [source()]), true).kind,
    ).toBe('paid');
  });

  it('shows nothing without a recorded purchase, or to a reader not given the price', () => {
    expect(rowPrice(install(InstallReason.Upgrade, null), false)).toEqual({
      kind: 'none',
    });
  });

  it('keeps the price without conversions when the purchase source is not given', () => {
    expect(rowPrice(install(InstallReason.Upgrade, 1450, []), false)).toEqual({
      kind: 'paid',
      amount: 1450,
      currency: 'UAH',
      converted: [],
    });
  });
});

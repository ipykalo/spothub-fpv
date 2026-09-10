import type { BuildCostDto, BuildPartDto } from '@spothub/shared';

import {
  type CurrencyTotal,
  sumByCurrency,
  toNullableDateOnly,
  toDateOnly,
} from '../common';
import type { FittedUnitDto } from '../parts';
import type { BuildCost, BuildPartEntity } from './build-part.entity';

/**
 * The single place a domain entity becomes a wire object.
 *
 * Explicit rather than a spread, so a column added to the database is not
 * silently published by the API.
 *
 * The unit and part arrive already in DTO form from the parts facade: this
 * module maps its own row and composes, rather than knowing how a part is
 * shaped in the database.
 */
export function toBuildPartDto(
  install: BuildPartEntity,
  fitted: FittedUnitDto,
): BuildPartDto {
  return {
    id: install.id,
    buildId: install.buildId,
    unitId: install.unitId,
    position: install.position,
    installedOn: toDateOnly(install.installedOn),
    removedOn: toNullableDateOnly(install.removedOn),
    reason: install.reason,
    repairId: install.repairId,
    unit: fitted.unit,
    part: fitted.part,
  };
}

export function toBuildCostDto(cost: BuildCost): BuildCostDto {
  return {
    totals: cost.totals.map(toMoneyDto),
    unpricedCount: cost.unpricedCount,
    installedCount: cost.installedCount,
    repairTotals: cost.repairTotals.map(toMoneyDto),
    repairCount: cost.repairCount,
  };
}

const toMoneyDto = (total: CurrencyTotal): CurrencyTotal => ({
  currency: total.currency,
  amount: total.amount,
});

/**
 * What the fitted parts cost, grouped by the currency they were bought in.
 *
 * Only a recorded purchase counts — `purchasePrice` is already the price of
 * the part's purchase source, and a browsed listing is price history, not
 * money spent. Parts fitted without one are counted separately, so the total
 * reads as the floor it actually is rather than as a complete figure.
 */
export function rollUpCost(
  parts: readonly FittedUnitDto[],
  repairTotals: readonly CurrencyTotal[] = [],
  repairCount = 0,
): BuildCost {
  const priced = parts.map((fitted) => ({
    price: fitted.part.purchasePrice,
    currency: fitted.part.purchaseCurrency,
  }));

  return {
    totals: sumByCurrency(priced),
    unpricedCount: priced.filter((row) => row.price === null).length,
    installedCount: parts.length,
    repairTotals,
    repairCount,
  };
}

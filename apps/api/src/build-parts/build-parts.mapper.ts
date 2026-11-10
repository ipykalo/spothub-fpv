import { type BuildCostDto, type BuildPartDto, InstallReason } from '@spothub/shared';

import {
  type CurrencyTotal,
  sumByCurrency,
  toNullableDateOnly,
  toDateOnly,
} from '../common';
import type { FittedUnitDto } from '../parts';
import type { BuildAccess, BuildCost, BuildPartEntity } from './build-part.entity';

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

/**
 * A fitted part as someone the build is shared with sees it: what it is and
 * where it sits, and then as much as its owner chose to share.
 *
 * What the owner cannot share away: when the unit was acquired, and the other
 * units of that part on the shelf. Those describe the owner's inventory rather
 * than this build, and no reader of a build has business with them.
 */
export function withoutOwnersDetails(
  install: BuildPartDto,
  access: BuildAccess,
): BuildPartDto {
  return {
    ...install,
    unit: {
      ...install.unit,
      acquiredOn: null,
      notes: access.shareNotes ? install.unit.notes : null,
    },
    part: {
      ...install.part,
      notesMd: access.shareNotes ? install.part.notesMd : null,
      units: [],
      sources: access.shareCosts ? install.part.sources : [],
      purchasePrice: access.shareCosts ? install.part.purchasePrice : null,
      purchaseCurrency: access.shareCosts ? install.part.purchaseCurrency : null,
    },
  };
}

export function toBuildCostDto(
  cost: BuildCost,
  converted: BuildCostDto['converted'],
): BuildCostDto {
  return {
    converted,
    totals: cost.totals.map(toMoneyDto),
    boughtFor: cost.boughtFor === null ? null : toMoneyDto(cost.boughtFor),
    stockCount: cost.stockCount,
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
 * What the quad cost, grouped by the currency it was paid in.
 *
 * Only a recorded purchase counts — `purchasePrice` is already the price of
 * the part's purchase source, and a browsed listing is price history, not
 * money spent. Parts fitted without one are counted separately, so the total
 * reads as the floor it actually is rather than as a complete figure.
 *
 * A quad bought ready-made starts from its own price, and the parts it came
 * with — its INITIAL installs — are inside that price: counted as stock, never
 * as unpriced, and never added again even if one carries a price of its own.
 * Whatever was fitted since, as a replacement or an upgrade, adds its own.
 */
export function rollUpCost(
  fitted: readonly { readonly reason: InstallReason; readonly fitted: FittedUnitDto }[],
  access: Pick<BuildAccess, 'boughtComplete' | 'boughtFor' | 'boughtOn'>,
  repairTotals: readonly CurrencyTotal[] = [],
  repairCount = 0,
): BuildCost {
  const isStock = (reason: InstallReason): boolean =>
    access.boughtComplete && reason === InstallReason.Initial;

  const priced = fitted
    .filter((row) => !isStock(row.reason))
    .map((row) => ({
      price: row.fitted.part.purchasePrice,
      currency: row.fitted.part.purchaseCurrency,
      day: paidOn(row.fitted),
    }));

  const quad =
    access.boughtFor === null
      ? []
      : [
          {
            price: access.boughtFor.amount,
            currency: access.boughtFor.currency,
            day: access.boughtOn,
          },
        ];

  const spent = [...quad, ...priced].flatMap((row) =>
    row.price === null || row.currency === null
      ? []
      : [{ amount: row.price, currency: row.currency, day: row.day }],
  );

  return {
    totals: sumByCurrency([...quad, ...priced]),
    boughtFor: access.boughtFor,
    stockCount: fitted.length - priced.length,
    unpricedCount: priced.filter((row) => row.price === null).length,
    installedCount: fitted.length,
    repairTotals,
    repairCount,
    spent,
  };
}

/**
 * The day a fitted part was paid for, for converting its price: the purchase
 * date on the row it was bought from, else the day that row was recorded,
 * else the day the part was entered.
 */
function paidOn(fitted: FittedUnitDto): string {
  const purchase = fitted.part.sources.find((source) => source.isPurchase);
  return (purchase?.purchasedOn ?? purchase?.capturedAt ?? fitted.part.createdAt).slice(
    0,
    10,
  );
}

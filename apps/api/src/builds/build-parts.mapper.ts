import type { BuildCostDto, BuildPartDto } from '@spothub/shared';

import { toPartDto } from '../parts/parts.mapper';
import type { BuildCost, BuildPartEntity } from './build-part.entity';

/** Date-only columns must not leak a timezone-shifted timestamp to the client. */
const toDateOnly = (value: Date): string => value.toISOString().slice(0, 10);

/**
 * The single place a domain entity becomes a wire object.
 *
 * Explicit rather than a spread, so a column added to the database is not
 * silently published by the API.
 */
export function toBuildPartDto(install: BuildPartEntity): BuildPartDto {
  return {
    id: install.id,
    buildId: install.buildId,
    partId: install.partId,
    position: install.position,
    installedOn: toDateOnly(install.installedOn),
    removedOn: install.removedOn ? toDateOnly(install.removedOn) : null,
    reason: install.reason,
    part: toPartDto(install.part),
  };
}

export function toBuildCostDto(cost: BuildCost): BuildCostDto {
  return {
    totals: cost.totals.map((total) => ({
      currency: total.currency,
      amount: total.amount,
    })),
    unpricedCount: cost.unpricedCount,
    installedCount: cost.installedCount,
  };
}

/**
 * What the fitted parts cost, grouped by the currency they were bought in.
 *
 * Only the source flagged `isPurchase` counts — a browsed listing is price
 * history, not money spent. Parts fitted without a recorded purchase are
 * counted separately, so the total reads as the floor it actually is rather
 * than as a complete figure.
 */
export function rollUpCost(installs: readonly BuildPartEntity[]): BuildCost {
  const byCurrency = new Map<string, number>();
  let unpricedCount = 0;

  for (const install of installs) {
    const purchase = install.part.sources.find((source) => source.isPurchase);

    if (purchase?.price == null) {
      unpricedCount += 1;
      continue;
    }

    // An unknown currency is still a real amount; bucket it under a placeholder
    // rather than dropping it and under-reporting the total.
    const currency = purchase.currency ?? '—';
    byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + purchase.price);
  }

  const totals = [...byCurrency.entries()]
    .map(([currency, amount]) => ({
      currency,
      // Money summed as floats drifts; two decimals is what a price column holds.
      amount: Math.round(amount * 100) / 100,
    }))
    .sort((a, b) => b.amount - a.amount);

  return { totals, unpricedCount, installedCount: installs.length };
}

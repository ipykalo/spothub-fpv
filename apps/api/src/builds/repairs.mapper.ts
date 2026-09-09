import type { RepairDto } from '@spothub/shared';

import type { CurrencyTotal } from './build-part.entity';
import type { RepairEntity } from './repair.entity';

/** Date-only columns must not leak a timezone-shifted timestamp to the client. */
const toDateOnly = (value: Date): string => value.toISOString().slice(0, 10);

/**
 * The single place a domain entity becomes a wire object.
 *
 * Explicit rather than a spread, so a column added to the database is not
 * silently published by the API.
 */
export function toRepairDto(repair: RepairEntity): RepairDto {
  return {
    id: repair.id,
    buildId: repair.buildId,
    occurredOn: toDateOnly(repair.occurredOn),
    cause: repair.cause,
    descriptionMd: repair.descriptionMd,
    cost: repair.cost,
    currency: repair.currency,
    installCount: repair.installCount,
    createdAt: repair.createdAt.toISOString(),
  };
}

/**
 * What the crashes have cost, grouped by the currency they were paid in.
 *
 * Same rule as the parts rollup: adding UAH to EUR produces a figure that
 * looks precise and means nothing. Kept apart from the parts total too — "what
 * is bolted to this quad" and "what has this quad cost me in crashes" are
 * different questions, and one number would answer neither.
 */
export function rollUpRepairs(
  repairs: readonly RepairEntity[],
): readonly CurrencyTotal[] {
  const byCurrency = new Map<string, number>();

  for (const repair of repairs) {
    if (repair.cost === null) {
      continue;
    }

    // An unknown currency is still real money; bucket it rather than drop it.
    const currency = repair.currency ?? '—';
    byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + repair.cost);
  }

  return [...byCurrency.entries()]
    .map(([currency, amount]) => ({
      currency,
      // Money summed as floats drifts; two decimals is what the column holds.
      amount: Math.round(amount * 100) / 100,
    }))
    .sort((a, b) => b.amount - a.amount);
}

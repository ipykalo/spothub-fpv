import type { RepairDto } from '@spothub/shared';

import { type CurrencyTotal, sumByCurrency, toDateOnly } from '../common';
import type { RepairEntity } from './repair.entity';

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
 * Kept apart from the parts total: "what is bolted to this quad" and "what has
 * this quad cost me in crashes" are different questions, and one number would
 * answer neither.
 */
export function rollUpRepairs(
  repairs: readonly RepairEntity[],
): readonly CurrencyTotal[] {
  return sumByCurrency(
    repairs.map((repair) => ({ price: repair.cost, currency: repair.currency })),
  );
}

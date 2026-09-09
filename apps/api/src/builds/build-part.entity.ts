import type { InstallReason } from '@spothub/shared';

import type { PartEntity, PartUnitEntity } from '../parts/part.entity';

/** One installation period, as the domain understands it. */
export interface BuildPartEntity {
  readonly id: string;
  readonly buildId: string;
  readonly unitId: string;
  readonly position: string | null;
  readonly installedOn: Date;
  readonly removedOn: Date | null;
  readonly reason: InstallReason;
  readonly repairId: string | null;
  readonly unit: PartUnitEntity;
  readonly part: PartEntity;
}

/** Fields the persistence layer accepts when fitting a part. */
export interface CreateBuildPartData {
  readonly buildId: string;
  readonly unitId: string;
  readonly position: string | null;
  readonly installedOn: Date;
  readonly reason: InstallReason;
  readonly repairId: string | null;
}

/**
 * A per-currency total.
 *
 * Never collapsed into one number: parts are bought in whatever the shop
 * charges in, and adding UAH to EUR produces a figure that looks precise and
 * means nothing.
 */
export interface CurrencyTotal {
  readonly currency: string;
  readonly amount: number;
}

export interface BuildCost {
  readonly totals: readonly CurrencyTotal[];
  readonly unpricedCount: number;
  readonly installedCount: number;
  /** Money spent on repairs, kept apart from what the fitted parts cost. */
  readonly repairTotals: readonly CurrencyTotal[];
  readonly repairCount: number;
}

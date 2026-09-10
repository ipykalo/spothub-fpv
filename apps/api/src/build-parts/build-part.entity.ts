import type { InstallReason } from '@spothub/shared';

import type { CurrencyTotal } from '../common';

/**
 * One installation period, as the domain understands it.
 *
 * It names a unit rather than embedding one. The unit and the kind of part
 * behind it belong to the parts module, and are fetched through its facade
 * when an install has to be rendered — this module owns the `build_parts` row
 * and nothing else.
 */
export interface BuildPartEntity {
  readonly id: string;
  readonly buildId: string;
  readonly unitId: string;
  readonly position: string | null;
  readonly installedOn: Date;
  readonly removedOn: Date | null;
  readonly reason: InstallReason;
  readonly repairId: string | null;
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

export interface BuildCost {
  readonly totals: readonly CurrencyTotal[];
  readonly unpricedCount: number;
  readonly installedCount: number;
  /** Money spent on repairs, kept apart from what the fitted parts cost. */
  readonly repairTotals: readonly CurrencyTotal[];
  readonly repairCount: number;
}

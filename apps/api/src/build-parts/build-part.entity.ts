import type { InstallReason } from '@spothub/shared';

import type { CurrencyTotal } from '../common';

/**
 * What a build says about who may read it and how much of it — the owner, and
 * the two things they may have chosen to share. A join on `builds` inside this
 * module's own repository, which is what keeps the rule in the same query as
 * the rows it guards.
 */
export interface BuildAccess {
  readonly ownerId: string;
  /** Prices, sources and the cost rollup are the owner's alone unless this is on. */
  readonly shareCosts: boolean;
  /** The owner's notes on a part or a unit are theirs alone unless this is on. */
  readonly shareNotes: boolean;
}

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

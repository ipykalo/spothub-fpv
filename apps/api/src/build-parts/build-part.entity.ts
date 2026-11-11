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
  /**
   * Bought ready-made: the parts it came with (its INITIAL installs) are
   * covered by `boughtFor` rather than priced on their own.
   */
  readonly boughtComplete: boolean;
  /** A bought quad's own price, when one was recorded with its currency. */
  readonly boughtFor: CurrencyTotal | null;
  /** `YYYY-MM-DD` the quad was bought, else the day the build was entered. */
  readonly boughtOn: string;
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
  readonly boughtFor: CurrencyTotal | null;
  readonly stockCount: number;
  readonly unpricedCount: number;
  readonly installedCount: number;
  /** Money spent on repairs, kept apart from what the fitted parts cost. */
  readonly repairTotals: readonly CurrencyTotal[];
  readonly repairCount: number;
  /** Every priced amount in `totals`, dated the day it was paid, for converting. */
  readonly spent: readonly DatedPrice[];
}

/** One amount paid, in its own currency, on a `YYYY-MM-DD` day. */
export interface DatedPrice {
  readonly amount: number;
  readonly currency: string;
  readonly day: string;
}

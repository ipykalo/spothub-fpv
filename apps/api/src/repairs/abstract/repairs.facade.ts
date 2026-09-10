import type { CurrencyTotal } from '../../common';

/** What this build's crashes have cost, and how many there were. */
export interface RepairCostSummary {
  readonly totals: readonly CurrencyTotal[];
  readonly count: number;
}

/**
 * The repairs module's public API — the only thing another module may inject.
 *
 * It exists so `build-parts` can report repair spend next to parts spend, and
 * can refuse to blame an install on a repair that is not real, without either
 * module reaching into the other's repository.
 */
export abstract class RepairsFacade {
  /** Money spent on this build's repairs, grouped by the currency paid in. */
  abstract costForBuild(ownerId: string, buildId: string): Promise<RepairCostSummary>;

  /** True when the repair exists, sits on this build, and belongs to this owner. */
  abstract existsForBuild(
    ownerId: string,
    buildId: string,
    repairId: string,
  ): Promise<boolean>;
}

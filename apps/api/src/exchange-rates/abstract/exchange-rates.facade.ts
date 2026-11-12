import type { ConvertedTotal, DatedAmount } from '../conversion';

/**
 * The exchange-rates module's public API: adding up prices paid in different
 * currencies. Asked by `build-parts`, `repairs` and `parts`; none of them ever
 * sees a rate.
 */
export abstract class ExchangeRatesFacade {
  /**
   * The sum of `amounts` in each of `currencies`, every price at the rate of
   * the day it was paid. Never waits on the bank: a day not fetched yet is
   * converted with the nearest stored day, marked approximate, and its own
   * rates are queued to be fetched for next time.
   */
  abstract totals(
    amounts: readonly DatedAmount[],
    currencies: readonly string[],
  ): Promise<ConvertedTotal[]>;

  /**
   * Each price on its own in every one of `currencies`, for showing it as
   * "≈ ₴… · ≈ $…" beside what was paid. One rate lookup for the whole list,
   * and the same never-waits rule as `totals`. In the order given.
   */
  abstract each(
    amounts: readonly DatedAmount[],
    currencies: readonly string[],
  ): Promise<ConvertedTotal[][]>;
}

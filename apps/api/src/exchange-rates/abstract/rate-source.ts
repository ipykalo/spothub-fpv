/**
 * Where official exchange rates come from: one day's, as hryvnias per unit of
 * each currency. An abstract class so it is also the DI token, and so the e2e
 * suite can swap in rates of its own rather than call a bank.
 */
export abstract class RateSource {
  /**
   * Every rate published for `day` (`YYYY-MM-DD`). Throws when the source
   * cannot be reached or answers with nothing, so the job retries.
   */
  abstract ratesFor(day: string): Promise<ReadonlyMap<string, number>>;
}

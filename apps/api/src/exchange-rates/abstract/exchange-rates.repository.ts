import type { RatesByDay } from '../conversion';

/** Persistence contract for the stored rates. Not owner-scoped: rates are nobody's. */
export abstract class ExchangeRatesRepository {
  /**
   * The rates stored for these days, plus the latest stored day on or before
   * the last of them — what a day not fetched yet is converted with meanwhile.
   */
  abstract ratesAround(days: readonly string[]): Promise<RatesByDay>;

  /** Which of these days have rates stored. */
  abstract storedDays(days: readonly string[]): Promise<ReadonlySet<string>>;

  /** Stores one day's rates. Storing a day again changes nothing. */
  abstract saveDay(day: string, rates: ReadonlyMap<string, number>): Promise<void>;
}

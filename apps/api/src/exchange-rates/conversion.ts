/**
 * Adding up prices paid in different currencies, at the rate of the day each
 * was paid. Pure, and free of `@spothub/shared`, so a unit test can load it.
 *
 * Every rate is hryvnias per unit — what the NBU publishes — so any currency
 * goes to any other through the hryvnia: `amount × uah[from] / uah[to]`.
 */

/** One price to convert, dated the day it was paid. */
export interface DatedAmount {
  readonly amount: number;
  readonly currency: string;
  /** `YYYY-MM-DD`. */
  readonly day: string;
}

/** Hryvnias per unit of each currency, by day. The hryvnia itself is implied. */
export type RatesByDay = ReadonlyMap<string, ReadonlyMap<string, number>>;

export interface ConvertedTotal {
  readonly currency: string;
  /** Null when some price could not be converted at all. */
  readonly amount: number | null;
  /** False when some price used another day's rate than its own. */
  readonly exact: boolean;
  /** The latest day whose rates went into it; null when none did. */
  readonly ratesOn: string | null;
}

const HRYVNIA = 'UAH';

function uahPerUnit(rates: ReadonlyMap<string, number> | undefined, currency: string): number | null {
  if (currency === HRYVNIA) {
    return 1;
  }

  return rates?.get(currency) ?? null;
}

/**
 * The rates to use for `day`: that day's own when they are stored, else the
 * latest stored day before it, else the earliest after it — approximate,
 * and said to be. Null when nothing is stored at all.
 */
export function ratesFor(
  day: string,
  rates: RatesByDay,
): { readonly day: string; readonly exact: boolean } | null {
  if (rates.has(day)) {
    return { day, exact: true };
  }

  const days = [...rates.keys()].sort();
  const before = days.filter((stored) => stored < day).at(-1);
  const nearest = before ?? days.find((stored) => stored > day);

  return nearest === undefined ? null : { day: nearest, exact: false };
}

/** The sum of `amounts` in `currency`, rounded to cents. */
export function convertTotal(
  amounts: readonly DatedAmount[],
  currency: string,
  rates: RatesByDay,
): ConvertedTotal {
  let sum = 0;
  let exact = true;
  const daysUsed: string[] = [];
  const latestUsed = (): string | null => daysUsed.sort().at(-1) ?? null;

  for (const entry of amounts) {
    if (entry.currency === currency) {
      sum += entry.amount;
      continue;
    }

    const used = ratesFor(entry.day, rates);
    const dayRates = used === null ? undefined : rates.get(used.day);
    const from = uahPerUnit(dayRates, entry.currency);
    const to = uahPerUnit(dayRates, currency);

    if (used === null || from === null || to === null) {
      return { currency, amount: null, exact: false, ratesOn: latestUsed() };
    }

    sum += (entry.amount * from) / to;
    exact &&= used.exact;
    daysUsed.push(used.day);
  }

  return { currency, amount: Math.round(sum * 100) / 100, exact, ratesOn: latestUsed() };
}

/** The days among `amounts` that a conversion into `currencies` needs a rate for. */
export function daysNeeded(
  amounts: readonly DatedAmount[],
  currencies: readonly string[],
): string[] {
  const days = new Set<string>();

  for (const entry of amounts) {
    if (currencies.some((target) => target !== entry.currency)) {
      days.add(entry.day);
    }
  }

  return [...days].sort();
}

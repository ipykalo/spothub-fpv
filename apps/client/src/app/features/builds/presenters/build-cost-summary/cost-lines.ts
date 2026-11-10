import type { ConvertedTotalDto } from '@spothub/shared';

/** What one cost card shows: the headline figures, what was paid, and how they relate. */
export interface CostLines {
  /** The big figures: converted totals, or what was paid when nothing could be converted. */
  readonly headline: readonly string[];
  /** What was actually paid, per currency, under the headline. Empty when the headline is it. */
  readonly paidAs: readonly string[];
  /** Where the conversion came from, and whether it is final. Null when nothing was converted. */
  readonly note: string | null;
}

interface Money {
  readonly currency: string;
  readonly amount: number;
}

/** `$410.20`, `₴18,640`, `zł12.50` — the currency's own sign, cents only when there are any. */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${String(amount)} ${currency}`;
  }
}

/**
 * The figures for a cost card. Converted totals lead, marked "≈", because
 * one number is what "what did it cost" asks for; what was paid follows, as
 * it was paid. A sum that was all paid in one currency already shown in it
 * needs no "≈" and no second line.
 */
export function costLines(
  paid: readonly Money[],
  converted: readonly ConvertedTotalDto[],
): CostLines {
  if (paid.length === 0) {
    return { headline: [], paidAs: [], note: null };
  }

  const usable = converted.filter(
    (total): total is ConvertedTotalDto & { amount: number } => total.amount !== null,
  );
  const paidText = paid.map((money) => formatMoney(money.amount, money.currency));

  if (usable.length === 0) {
    return {
      headline: paidText,
      paidAs: [],
      note: converted.length
        ? 'Exchange rates are being fetched — reload in a moment for a total.'
        : null,
    };
  }

  const single = paid.length === 1 ? paid[0] : null;
  const headline = usable.map((total) =>
    single?.currency === total.currency
      ? formatMoney(total.amount, total.currency)
      : `≈ ${formatMoney(total.amount, total.currency)}`,
  );
  const alreadyShown =
    single !== null && usable.some((total) => total.currency === single.currency);
  const exact = usable.every((total) => total.exact);
  const ratesOn = usable
    .map((total) => total.ratesOn)
    .filter((day): day is string => day !== null)
    .sort()
    .at(-1);

  return {
    headline,
    paidAs: alreadyShown ? [] : paidText,
    note:
      ratesOn === undefined
        ? null
        : exact
          ? 'At the NBU’s official rate on each purchase date.'
          : `At NBU rates up to ${ratesOn}; some purchase dates are still being fetched, so this is rough until the next reload.`,
  };
}

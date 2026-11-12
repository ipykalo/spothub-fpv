import type { ConvertedTotalDto } from '@spothub/shared';

import { formatMoney } from '../../../../core/format/money';

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
      note: null,
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
  // Only a figure that went through a rate needs saying so. Which bank, and
  // that a day's rate may still be on its way, mean nothing to most readers:
  // the "≈" already says it is not exact.
  const anyConverted = usable.some((total) => total.ratesOn !== null);

  return {
    headline,
    paidAs: alreadyShown ? [] : paidText,
    note: anyConverted ? '≈ converted at the exchange rate on each purchase date.' : null,
  };
}

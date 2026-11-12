import type { ConvertedTotalDto } from '@spothub/shared';

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

/** One price as every page shows it: what was paid, then roughly what that is. */
export interface PriceLine {
  /** What was paid, in the currency it was paid in. */
  readonly paid: string;
  /** `≈ ₴4,203`, `≈ $100` — the viewer's currency, then USD, each only if it differs from what was paid. */
  readonly approx: readonly string[];
}

/**
 * What was paid leads, as it was paid; the conversions follow, marked "≈".
 * One already in the paid currency adds nothing and is left out, and so is
 * one that could not be converted — so a price in the viewer's own currency
 * reads `₴4,203 ≈ $100`, and one in USD for a USD viewer is just `$100`.
 */
export function priceLine(
  amount: number,
  currency: string,
  converted: readonly ConvertedTotalDto[],
): PriceLine {
  return {
    paid: formatMoney(amount, currency),
    approx: converted.flatMap((total) =>
      total.amount === null || total.currency === currency
        ? []
        : [`≈ ${formatMoney(total.amount, total.currency)}`],
    ),
  };
}

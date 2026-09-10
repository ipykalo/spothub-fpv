/**
 * A per-currency total.
 *
 * Never collapsed into one number: parts are bought in whatever the shop
 * charges in, and adding UAH to EUR produces a figure that looks precise and
 * means nothing.
 */
export interface CurrencyTotal {
  readonly currency: string;
  readonly amount: number;
}

/** A row that carries an amount of money in some currency. */
interface Priced {
  readonly price: number | null;
  readonly currency: string | null;
}

/**
 * Buckets amounts by the currency they were paid in, largest first.
 *
 * Shared by the parts rollup and the repair rollup because both answer the
 * same shape of question and got the same three details wrong independently:
 * an unknown currency is still real money and is bucketed under a placeholder
 * rather than dropped, floats are rounded back to the two decimals a price
 * column holds, and nothing is ever added across currencies.
 */
export function sumByCurrency(rows: readonly Priced[]): readonly CurrencyTotal[] {
  const byCurrency = new Map<string, number>();

  for (const row of rows) {
    if (row.price === null) {
      continue;
    }

    const currency = row.currency ?? '—';
    byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + row.price);
  }

  return [...byCurrency.entries()]
    .map(([currency, amount]) => ({
      currency,
      amount: Math.round(amount * 100) / 100,
    }))
    .sort((a, b) => b.amount - a.amount);
}

import {
  type BuildPartDto,
  type ConvertedTotalDto,
  InstallReason,
} from '@spothub/shared';

import { purchaseConverted } from '../../../parts/part-price';

/** What a component row shows for money. */
export type RowPrice =
  | {
      readonly kind: 'paid';
      readonly amount: number;
      readonly currency: string;
      readonly converted: readonly ConvertedTotalDto[];
    }
  /** Came with a quad bought complete: inside the quad's price, never counted on its own. */
  | { readonly kind: 'included' }
  /** No purchase recorded, or a reader the owner shares no costs with. */
  | { readonly kind: 'none' };

/**
 * The price on a component row, by the same rule as the cost rollup: a part
 * a bought quad came with is covered by the quad's price — even if the part
 * carries a price of its own, which would read as money spent twice — and
 * anything fitted since shows what was paid for it.
 */
export function rowPrice(install: BuildPartDto, boughtComplete: boolean): RowPrice {
  if (boughtComplete && install.reason === InstallReason.Initial) {
    return { kind: 'included' };
  }

  const { purchasePrice, purchaseCurrency } = install.part;

  if (purchasePrice === null || purchaseCurrency === null) {
    return { kind: 'none' };
  }

  return {
    kind: 'paid',
    amount: purchasePrice,
    currency: purchaseCurrency,
    converted: purchaseConverted(install.part),
  };
}

import type { ConvertedTotalDto, PartDto } from '@spothub/shared';

/**
 * A part's purchase price converted into the viewer's currency and USD.
 *
 * `purchasePrice` is the price of the source flagged as the purchase, so that
 * source's conversions are the purchase's. Empty when nothing was bought, or
 * when the reader is not given the sources.
 */
export function purchaseConverted(part: PartDto): readonly ConvertedTotalDto[] {
  return part.sources.find((source) => source.isPurchase)?.converted ?? [];
}

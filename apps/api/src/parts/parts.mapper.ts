import type { PartDto, PartSourceDto } from '@spothub/shared';

import type { PartEntity, PartSourceEntity } from './part.entity';

/** Date-only columns must not leak a timezone-shifted timestamp to the client. */
const toDateOnly = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;

export function toPartSourceDto(source: PartSourceEntity): PartSourceDto {
  return {
    id: source.id,
    partId: source.partId,
    vendor: source.vendor,
    url: source.url,
    price: source.price,
    currency: source.currency,
    isPurchase: source.isPurchase,
    purchasedOn: toDateOnly(source.purchasedOn),
    quantity: source.quantity,
    capturedAt: source.capturedAt.toISOString(),
  };
}

/**
 * The single place a domain entity becomes a wire object.
 *
 * Explicit rather than a spread, so a column added to the database is not
 * silently published by the API.
 */
export function toPartDto(part: PartEntity): PartDto {
  // The purchase row is what a cost rollup may count; browsed listings are
  // price history and must not be mistaken for money actually spent.
  const purchase = part.sources.find((source) => source.isPurchase) ?? null;

  return {
    id: part.id,
    category: part.category,
    manufacturer: part.manufacturer,
    model: part.model,
    spec: part.spec,
    quantityOwned: part.quantityOwned,
    status: part.status,
    notesMd: part.notesMd,
    sources: part.sources.map(toPartSourceDto),
    purchasePrice: purchase?.price ?? null,
    purchaseCurrency: purchase?.currency ?? null,
    createdAt: part.createdAt.toISOString(),
    updatedAt: part.updatedAt.toISOString(),
  };
}

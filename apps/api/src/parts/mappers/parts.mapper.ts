import type { PartDto } from '@spothub/shared';

import type { PartEntity } from '../entities/part.entity';
import { toPartSourceDto } from './part-sources.mapper';
import { toPartUnitDto } from './part-units.mapper';

/**
 * The single place a part becomes a wire object.
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
    notesMd: part.notesMd,
    units: part.units.map(toPartUnitDto),
    sources: part.sources.map(toPartSourceDto),
    purchasePrice: purchase?.price ?? null,
    purchaseCurrency: purchase?.currency ?? null,
    createdAt: part.createdAt.toISOString(),
    updatedAt: part.updatedAt.toISOString(),
  };
}

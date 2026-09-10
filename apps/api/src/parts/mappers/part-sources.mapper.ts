import type { PartSourceDto } from '@spothub/shared';

import { toNullableDateOnly } from '../../common';
import type { PartSourceEntity } from '../entities/part-source.entity';

/** The single place a source becomes a wire object. */
export function toPartSourceDto(source: PartSourceEntity): PartSourceDto {
  return {
    id: source.id,
    partId: source.partId,
    vendor: source.vendor,
    url: source.url,
    price: source.price,
    currency: source.currency,
    isPurchase: source.isPurchase,
    purchasedOn: toNullableDateOnly(source.purchasedOn),
    quantity: source.quantity,
    capturedAt: source.capturedAt.toISOString(),
  };
}

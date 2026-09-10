import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreatePartSourceDto,
  PartSourceDto,
  UpdatePartSourceDto,
} from '@spothub/shared';

import { fromDateOnly } from '../../common';
import { PartSourcesRepository } from '../abstract/part-sources.repository';
import type { UpdatePartSourceData } from '../entities/part-source.entity';
import { toPartSourceDto } from '../mappers/part-sources.mapper';

/** Business rules for price sources. Knows nothing about HTTP or Prisma. */
@Injectable()
export class PartSourcesService {
  constructor(private readonly sources: PartSourcesRepository) {}

  async add(
    ownerId: string,
    partId: string,
    input: CreatePartSourceDto,
  ): Promise<PartSourceDto> {
    const source = await this.sources.addForOwner(ownerId, partId, {
      vendor: input.vendor,
      url: input.url,
      price: input.price,
      currency: input.currency,
      isPurchase: input.isPurchase,
      purchasedOn: toNullableDate(input.purchasedOn),
      quantity: input.quantity,
    });

    if (!source) {
      throw new NotFoundException('Part not found');
    }

    return toPartSourceDto(source);
  }

  async update(
    ownerId: string,
    partId: string,
    sourceId: string,
    input: UpdatePartSourceDto,
  ): Promise<PartSourceDto> {
    const source = await this.sources.updateForOwner(
      ownerId,
      partId,
      sourceId,
      toUpdateData(input),
    );

    if (!source) {
      throw new NotFoundException('Source not found');
    }

    return toPartSourceDto(source);
  }

  async remove(ownerId: string, partId: string, sourceId: string): Promise<void> {
    const deleted = await this.sources.deleteForOwner(ownerId, partId, sourceId);

    if (!deleted) {
      throw new NotFoundException('Source not found');
    }
  }
}

/** Copies only the keys present, so an absent field is left alone. */
function toUpdateData(input: UpdatePartSourceDto): UpdatePartSourceData {
  const data: UpdatePartSourceData = {};
  const patch = data as Record<string, unknown>;

  if (input.vendor !== undefined) patch['vendor'] = input.vendor;
  if (input.url !== undefined) patch['url'] = input.url;
  if (input.price !== undefined) patch['price'] = input.price;
  if (input.currency !== undefined) patch['currency'] = input.currency;
  if (input.isPurchase !== undefined) patch['isPurchase'] = input.isPurchase;
  if (input.purchasedOn !== undefined)
    patch['purchasedOn'] = toNullableDate(input.purchasedOn);
  if (input.quantity !== undefined) patch['quantity'] = input.quantity;

  return data;
}

const toNullableDate = (value: string | null | undefined): Date | null =>
  value ? fromDateOnly(value) : null;

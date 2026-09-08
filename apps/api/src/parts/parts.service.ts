import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreatePartDto,
  CreatePartSourceDto,
  ListPartsQuery,
  PartDto,
  PartSourceDto,
  UpdatePartDto,
} from '@spothub/shared';

import type { UpdatePartData } from './part.entity';
import { toPartDto, toPartSourceDto } from './parts.mapper';
import { PartsRepository } from './parts.repository';

/** Business rules for parts. Knows nothing about HTTP or Prisma. */
@Injectable()
export class PartsService {
  constructor(private readonly parts: PartsRepository) {}

  async list(ownerId: string, query: ListPartsQuery): Promise<PartDto[]> {
    const parts = await this.parts.findManyForOwner(ownerId, query);
    return parts.map(toPartDto);
  }

  async getOne(ownerId: string, id: string): Promise<PartDto> {
    const part = await this.parts.findOneForOwner(ownerId, id);

    if (!part) {
      throw new NotFoundException('Part not found');
    }

    return toPartDto(part);
  }

  async create(ownerId: string, input: CreatePartDto): Promise<PartDto> {
    const part = await this.parts.create({
      ownerId,
      category: input.category,
      manufacturer: input.manufacturer,
      model: input.model,
      spec: input.spec,
      quantityOwned: input.quantityOwned,
      status: input.status,
      notesMd: input.notesMd,
    });

    return toPartDto(part);
  }

  async update(ownerId: string, id: string, input: UpdatePartDto): Promise<PartDto> {
    const part = await this.parts.updateForOwner(ownerId, id, toUpdateData(input));

    if (!part) {
      throw new NotFoundException('Part not found');
    }

    return toPartDto(part);
  }

  async remove(ownerId: string, id: string): Promise<void> {
    const deleted = await this.parts.deleteForOwner(ownerId, id);

    if (!deleted) {
      throw new NotFoundException('Part not found');
    }
  }

  async addSource(
    ownerId: string,
    partId: string,
    input: CreatePartSourceDto,
  ): Promise<PartSourceDto> {
    const source = await this.parts.addSourceForOwner(ownerId, partId, {
      vendor: input.vendor,
      url: input.url,
      price: input.price,
      currency: input.currency,
      isPurchase: input.isPurchase,
      purchasedOn: toDate(input.purchasedOn),
      quantity: input.quantity,
    });

    if (!source) {
      throw new NotFoundException('Part not found');
    }

    return toPartSourceDto(source);
  }

  async removeSource(ownerId: string, partId: string, sourceId: string): Promise<void> {
    const deleted = await this.parts.deleteSourceForOwner(ownerId, partId, sourceId);

    if (!deleted) {
      throw new NotFoundException('Source not found');
    }
  }
}

/**
 * Copies only the keys actually present on the patch, so an absent field is
 * left alone rather than being written as null.
 */
function toUpdateData(input: UpdatePartDto): UpdatePartData {
  const data: UpdatePartData = {};
  const patch = data as Record<string, unknown>;

  if (input.category !== undefined) patch['category'] = input.category;
  if (input.manufacturer !== undefined) patch['manufacturer'] = input.manufacturer;
  if (input.model !== undefined) patch['model'] = input.model;
  if (input.spec !== undefined) patch['spec'] = input.spec;
  if (input.quantityOwned !== undefined) patch['quantityOwned'] = input.quantityOwned;
  if (input.status !== undefined) patch['status'] = input.status;
  if (input.notesMd !== undefined) patch['notesMd'] = input.notesMd;

  return data;
}

/** `YYYY-MM-DD` is stored at UTC midnight so it round-trips as the same day. */
function toDate(value: string | null | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

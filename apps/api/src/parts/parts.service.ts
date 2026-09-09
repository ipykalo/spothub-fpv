import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreatePartDto,
  CreatePartSourceDto,
  CreatePartUnitDto,
  ListPartsQuery,
  PartDto,
  PartSourceDto,
  PartUnitDto,
  UpdatePartDto,
  UpdatePartSourceDto,
  UpdatePartUnitDto,
} from '@spothub/shared';

import type {
  UpdatePartData,
  UpdatePartSourceData,
  UpdatePartUnitData,
} from './part.entity';
import { toPartDto, toPartSourceDto, toPartUnitDto } from './parts.mapper';
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
      notesMd: input.notesMd,
      quantity: input.quantity,
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

  async updateSource(
    ownerId: string,
    partId: string,
    sourceId: string,
    input: UpdatePartSourceDto,
  ): Promise<PartSourceDto> {
    const source = await this.parts.updateSourceForOwner(
      ownerId,
      partId,
      sourceId,
      toSourceUpdateData(input),
    );

    if (!source) {
      throw new NotFoundException('Source not found');
    }

    return toPartSourceDto(source);
  }

  async addUnit(
    ownerId: string,
    partId: string,
    input: CreatePartUnitDto,
  ): Promise<PartUnitDto> {
    const unit = await this.parts.addUnitForOwner(ownerId, partId, {
      condition: input.condition,
      label: input.label,
      acquiredOn: toDate(input.acquiredOn),
      notes: input.notes,
    });

    if (!unit) {
      throw new NotFoundException('Part not found');
    }

    return toPartUnitDto(unit);
  }

  async updateUnit(
    ownerId: string,
    partId: string,
    unitId: string,
    input: UpdatePartUnitDto,
  ): Promise<PartUnitDto> {
    const unit = await this.parts.updateUnitForOwner(
      ownerId,
      partId,
      unitId,
      toUnitUpdateData(input),
    );

    if (!unit) {
      throw new NotFoundException('Unit not found');
    }

    return toPartUnitDto(unit);
  }

  /**
   * A fitted unit cannot be deleted: the cascade would take the build's
   * install history with it. Take it off the quad first.
   */
  async removeUnit(ownerId: string, partId: string, unitId: string): Promise<void> {
    const outcome = await this.parts.deleteUnitForOwner(ownerId, partId, unitId);

    if (outcome === 'missing') {
      throw new NotFoundException('Unit not found');
    }

    if (outcome === 'fitted') {
      throw new ConflictException('Remove this unit from its build before deleting it');
    }
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
  if (input.notesMd !== undefined) patch['notesMd'] = input.notesMd;

  return data;
}

/** `YYYY-MM-DD` is stored at UTC midnight so it round-trips as the same day. */
function toDate(value: string | null | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

/** Copies only the keys present, so an absent field is left alone. */
function toSourceUpdateData(input: UpdatePartSourceDto): UpdatePartSourceData {
  const data: UpdatePartSourceData = {};
  const patch = data as Record<string, unknown>;

  if (input.vendor !== undefined) patch['vendor'] = input.vendor;
  if (input.url !== undefined) patch['url'] = input.url;
  if (input.price !== undefined) patch['price'] = input.price;
  if (input.currency !== undefined) patch['currency'] = input.currency;
  if (input.isPurchase !== undefined) patch['isPurchase'] = input.isPurchase;
  if (input.purchasedOn !== undefined) patch['purchasedOn'] = toDate(input.purchasedOn);
  if (input.quantity !== undefined) patch['quantity'] = input.quantity;

  return data;
}

/** Copies only the keys present, so an absent field is left alone. */
function toUnitUpdateData(input: UpdatePartUnitDto): UpdatePartUnitData {
  const data: UpdatePartUnitData = {};
  const patch = data as Record<string, unknown>;

  if (input.condition !== undefined) patch['condition'] = input.condition;
  if (input.label !== undefined) patch['label'] = input.label;
  if (input.acquiredOn !== undefined) patch['acquiredOn'] = toDate(input.acquiredOn);
  if (input.notes !== undefined) patch['notes'] = input.notes;

  return data;
}

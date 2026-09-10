import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreatePartDto,
  ListPartsQuery,
  PartDto,
  UpdatePartDto,
} from '@spothub/shared';

import { PartsRepository } from '../abstract/parts.repository';
import type { UpdatePartData } from '../entities/part.entity';
import { toPartDto } from '../mappers/parts.mapper';

/** Business rules for the part catalogue. Knows nothing about HTTP or Prisma. */
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

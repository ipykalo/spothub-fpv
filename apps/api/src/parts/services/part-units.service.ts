import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreatePartUnitDto, PartUnitDto, UpdatePartUnitDto } from '@spothub/shared';

import { fromDateOnly } from '../../common';
import { PartUnitsRepository } from '../abstract/part-units.repository';
import type { UpdatePartUnitData } from '../entities/part-unit.entity';
import { toPartUnitDto } from '../mappers/part-units.mapper';

/** Business rules for physical units. Knows nothing about HTTP or Prisma. */
@Injectable()
export class PartUnitsService {
  constructor(private readonly units: PartUnitsRepository) {}

  async add(
    ownerId: string,
    partId: string,
    input: CreatePartUnitDto,
  ): Promise<PartUnitDto> {
    const unit = await this.units.addForOwner(ownerId, partId, {
      condition: input.condition,
      label: input.label,
      acquiredOn: toNullableDate(input.acquiredOn),
      notes: input.notes,
    });

    if (!unit) {
      throw new NotFoundException('Part not found');
    }

    return toPartUnitDto(unit);
  }

  async update(
    ownerId: string,
    partId: string,
    unitId: string,
    input: UpdatePartUnitDto,
  ): Promise<PartUnitDto> {
    const unit = await this.units.updateForOwner(
      ownerId,
      partId,
      unitId,
      toUpdateData(input),
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
  async remove(ownerId: string, partId: string, unitId: string): Promise<void> {
    const outcome = await this.units.deleteForOwner(ownerId, partId, unitId);

    if (outcome === 'missing') {
      throw new NotFoundException('Unit not found');
    }

    if (outcome === 'fitted') {
      throw new ConflictException('Remove this unit from its build before deleting it');
    }
  }
}

/** Copies only the keys present, so an absent field is left alone. */
function toUpdateData(input: UpdatePartUnitDto): UpdatePartUnitData {
  const data: UpdatePartUnitData = {};
  const patch = data as Record<string, unknown>;

  if (input.condition !== undefined) patch['condition'] = input.condition;
  if (input.label !== undefined) patch['label'] = input.label;
  if (input.acquiredOn !== undefined)
    patch['acquiredOn'] = toNullableDate(input.acquiredOn);
  if (input.notes !== undefined) patch['notes'] = input.notes;

  return data;
}

const toNullableDate = (value: string | null | undefined): Date | null =>
  value ? fromDateOnly(value) : null;

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma';
import {
  type PartUnitWithPart,
  PartUnitsRepository,
} from '../abstract/part-units.repository';
import type {
  CreatePartUnitData,
  PartUnitEntity,
  UpdatePartUnitData,
} from '../entities/part-unit.entity';
import {
  FITTED_COUNT,
  WITH_RELATIONS,
  toPartEntity,
  toPartUnitEntity,
} from './part-row.mapper';

/** The only place the units feature knows Prisma exists. */
@Injectable()
export class PrismaPartUnitsRepository extends PartUnitsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findManyWithPartForOwner(
    ownerId: string,
    unitIds: readonly string[],
  ): Promise<PartUnitWithPart[]> {
    const units = await this.prisma.partUnit.findMany({
      // Scoped through the parent part's owner, so a guessed unit id returns
      // nothing rather than someone else's motor.
      where: { id: { in: [...unitIds] }, part: { ownerId } },
      include: { ...FITTED_COUNT, part: { include: WITH_RELATIONS } },
    });

    return units.map((unit) => ({
      unit: toPartUnitEntity(unit),
      part: toPartEntity(unit.part),
    }));
  }

  async existsForOwner(ownerId: string, unitId: string): Promise<boolean> {
    const unit = await this.prisma.partUnit.findFirst({
      where: { id: unitId, part: { ownerId } },
      select: { id: true },
    });

    return unit !== null;
  }

  /**
   * The part is re-checked against the owner before the unit is written, so a
   * unit cannot be attached to somebody else's part by guessing its id.
   */
  async addForOwner(
    ownerId: string,
    partId: string,
    data: CreatePartUnitData,
  ): Promise<PartUnitEntity | null> {
    const owned = await this.prisma.part.findFirst({
      where: { id: partId, ownerId },
      select: { id: true },
    });

    if (!owned) {
      return null;
    }

    const unit = await this.prisma.partUnit.create({
      data: { ...data, partId },
      include: FITTED_COUNT,
    });

    return toPartUnitEntity(unit);
  }

  async updateForOwner(
    ownerId: string,
    partId: string,
    unitId: string,
    data: UpdatePartUnitData,
  ): Promise<PartUnitEntity | null> {
    const { count } = await this.prisma.partUnit.updateMany({
      where: { id: unitId, partId, part: { ownerId } },
      data: { ...data },
    });

    if (count === 0) {
      return null;
    }

    const unit = await this.prisma.partUnit.findUnique({
      where: { id: unitId },
      include: FITTED_COUNT,
    });

    return unit ? toPartUnitEntity(unit) : null;
  }

  /**
   * Deleting a fitted unit would cascade its install rows away, taking the
   * build's history with it. Report the refusal rather than doing it.
   */
  async deleteForOwner(
    ownerId: string,
    partId: string,
    unitId: string,
  ): Promise<'deleted' | 'fitted' | 'missing'> {
    const unit = await this.prisma.partUnit.findFirst({
      where: { id: unitId, partId, part: { ownerId } },
      include: FITTED_COUNT,
    });

    if (!unit) {
      return 'missing';
    }

    if (unit._count.installs > 0) {
      return 'fitted';
    }

    await this.prisma.partUnit.delete({ where: { id: unitId } });
    return 'deleted';
  }
}

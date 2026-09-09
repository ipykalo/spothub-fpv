import { Injectable } from '@nestjs/common';
import { type Part, type PartSource, type PartUnit, Prisma } from '@prisma/client';
import type { PartSpec } from '@spothub/shared';

import { PrismaService } from '../prisma/prisma.service';
import type {
  CreatePartData,
  CreatePartSourceData,
  CreatePartUnitData,
  PartEntity,
  PartSourceEntity,
  PartUnitEntity,
  UpdatePartData,
  UpdatePartSourceData,
  UpdatePartUnitData,
} from './part.entity';
import { PartFilter, PartsRepository } from './parts.repository';

type UnitWithInstalls = PartUnit & { _count: { installs: number } };

type PartWithRelations = Part & {
  sources: PartSource[];
  units: UnitWithInstalls[];
};

/**
 * A unit is fitted when it has an install still open. Counting them in the
 * same query beats a second round trip per unit, and keeps "is it fitted"
 * derived rather than stored.
 */
const WITH_RELATIONS = {
  sources: true,
  units: {
    include: { _count: { select: { installs: { where: { removedOn: null } } } } },
    // Stable order so a unit keeps the same position in the list it is
    // numbered by on screen.
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.PartInclude;

/**
 * The only place in the parts feature that knows Prisma exists.
 */
@Injectable()
export class PrismaPartsRepository extends PartsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findManyForOwner(ownerId: string, filter: PartFilter): Promise<PartEntity[]> {
    const parts = await this.prisma.part.findMany({
      where: {
        ownerId,
        ...(filter.category ? { category: filter.category } : {}),
        // "Has at least one unit in this condition" — a part is no longer in
        // one condition, so the filter asks about its units.
        ...(filter.condition ? { units: { some: { condition: filter.condition } } } : {}),
        ...(filter.search ? { OR: searchClauses(filter.search) } : {}),
      },
      include: WITH_RELATIONS,
      orderBy: [{ category: 'asc' }, { updatedAt: 'desc' }],
    });

    return parts.map((part) => PrismaPartsRepository.toEntity(part));
  }

  async findOneForOwner(ownerId: string, id: string): Promise<PartEntity | null> {
    const part = await this.prisma.part.findFirst({
      where: { id, ownerId },
      include: WITH_RELATIONS,
    });

    return part ? PrismaPartsRepository.toEntity(part) : null;
  }

  /**
   * The part and its units are created together: a kind of thing with no
   * objects behind it is not something the inventory should ever hold.
   */
  async create(data: CreatePartData): Promise<PartEntity> {
    const { quantity, ...fields } = data;

    const part = await this.prisma.part.create({
      data: {
        ...fields,
        spec: fields.spec,
        units: { create: Array.from({ length: quantity }, () => ({})) },
      },
      include: WITH_RELATIONS,
    });

    return PrismaPartsRepository.toEntity(part);
  }

  /**
   * `updateMany` scoped by owner, then re-read. This makes it impossible to
   * update a row belonging to someone else, and returns null rather than
   * throwing when the id simply is not theirs.
   */
  async updateForOwner(
    ownerId: string,
    id: string,
    data: UpdatePartData,
  ): Promise<PartEntity | null> {
    const { spec, ...rest } = data;

    const { count } = await this.prisma.part.updateMany({
      where: { id, ownerId },
      data: {
        ...rest,
        ...(spec === undefined ? {} : { spec }),
      },
    });

    return count === 0 ? null : this.findOneForOwner(ownerId, id);
  }

  async deleteForOwner(ownerId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.part.deleteMany({ where: { id, ownerId } });
    return count > 0;
  }

  /**
   * The part is re-checked against the owner before the source is written, so
   * a source cannot be attached to somebody else's part by guessing its id.
   */
  async addSourceForOwner(
    ownerId: string,
    partId: string,
    data: CreatePartSourceData,
  ): Promise<PartSourceEntity | null> {
    const owned = await this.prisma.part.findFirst({
      where: { id: partId, ownerId },
      select: { id: true },
    });

    if (!owned) {
      return null;
    }

    const source = await this.prisma.partSource.create({ data: { ...data, partId } });
    return PrismaPartsRepository.toSourceEntity(source);
  }

  /**
   * Scoped through the parent part's owner in the same `updateMany`, so a
   * source belonging to someone else cannot be reached by guessing two ids.
   */
  async updateSourceForOwner(
    ownerId: string,
    partId: string,
    sourceId: string,
    data: UpdatePartSourceData,
  ): Promise<PartSourceEntity | null> {
    const { count } = await this.prisma.partSource.updateMany({
      where: { id: sourceId, partId, part: { ownerId } },
      data: { ...data },
    });

    if (count === 0) {
      return null;
    }

    const source = await this.prisma.partSource.findUnique({ where: { id: sourceId } });
    return source ? PrismaPartsRepository.toSourceEntity(source) : null;
  }

  async deleteSourceForOwner(
    ownerId: string,
    partId: string,
    sourceId: string,
  ): Promise<boolean> {
    const { count } = await this.prisma.partSource.deleteMany({
      where: { id: sourceId, partId, part: { ownerId } },
    });

    return count > 0;
  }

  async addUnitForOwner(
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
      include: { _count: { select: { installs: { where: { removedOn: null } } } } },
    });

    return PrismaPartsRepository.toUnitEntity(unit);
  }

  async updateUnitForOwner(
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
      include: { _count: { select: { installs: { where: { removedOn: null } } } } },
    });

    return unit ? PrismaPartsRepository.toUnitEntity(unit) : null;
  }

  /**
   * Deleting a fitted unit would cascade its install rows away, taking the
   * build's history with it. Report the refusal rather than doing it.
   */
  async deleteUnitForOwner(
    ownerId: string,
    partId: string,
    unitId: string,
  ): Promise<'deleted' | 'fitted' | 'missing'> {
    const unit = await this.prisma.partUnit.findFirst({
      where: { id: unitId, partId, part: { ownerId } },
      include: { _count: { select: { installs: { where: { removedOn: null } } } } },
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

  private static toEntity(part: PartWithRelations): PartEntity {
    return {
      id: part.id,
      ownerId: part.ownerId,
      category: part.category,
      manufacturer: part.manufacturer,
      model: part.model,
      spec: (part.spec ?? {}) as PartSpec,
      notesMd: part.notesMd,
      units: part.units.map((unit) => PrismaPartsRepository.toUnitEntity(unit)),
      sources: part.sources.map((source) => PrismaPartsRepository.toSourceEntity(source)),
      createdAt: part.createdAt,
      updatedAt: part.updatedAt,
    };
  }

  private static toUnitEntity(unit: UnitWithInstalls): PartUnitEntity {
    return {
      id: unit.id,
      partId: unit.partId,
      condition: unit.condition,
      label: unit.label,
      acquiredOn: unit.acquiredOn,
      notes: unit.notes,
      fitted: unit._count.installs > 0,
      createdAt: unit.createdAt,
    };
  }

  /** `Decimal` is a Prisma type and must not escape this file. */
  private static toSourceEntity(source: PartSource): PartSourceEntity {
    return {
      id: source.id,
      partId: source.partId,
      vendor: source.vendor,
      url: source.url,
      price: source.price === null ? null : source.price.toNumber(),
      currency: source.currency,
      isPurchase: source.isPurchase,
      purchasedOn: source.purchasedOn,
      quantity: source.quantity,
      capturedAt: source.capturedAt,
    };
  }
}

/** Free-text search spans the two columns a person would actually recall. */
function searchClauses(search: string): Prisma.PartWhereInput[] {
  const contains = { contains: search, mode: 'insensitive' as const };
  return [{ manufacturer: contains }, { model: contains }];
}

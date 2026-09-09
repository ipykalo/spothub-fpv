import { Injectable } from '@nestjs/common';
import {
  type BuildPart,
  type Part,
  type PartSource,
  type PartUnit,
  Prisma,
} from '@prisma/client';
import type { PartSpec } from '@spothub/shared';

import { PrismaService } from '../prisma/prisma.service';
import type { PartEntity, PartSourceEntity, PartUnitEntity } from '../parts/part.entity';
import type { BuildPartEntity, CreateBuildPartData } from './build-part.entity';
import { BuildPartFilter, BuildPartsRepository } from './build-parts.repository';

type UnitWithInstalls = PartUnit & { _count: { installs: number } };

type InstallWithUnit = BuildPart & {
  unit: UnitWithInstalls & {
    part: Part & { sources: PartSource[]; units: UnitWithInstalls[] };
  };
};

const FITTED_COUNT = {
  _count: { select: { installs: { where: { removedOn: null } } } },
};

/**
 * An install names a unit; the unit names its kind. Both come back in one
 * query so the client can show "motor FR — UAngel X2810" without a lookup.
 */
const WITH_UNIT = {
  unit: {
    include: {
      ...FITTED_COUNT,
      part: { include: { sources: true, units: { include: FITTED_COUNT } } },
    },
  },
} satisfies Prisma.BuildPartInclude;

/** The only place in this feature that knows Prisma exists. */
@Injectable()
export class PrismaBuildPartsRepository extends BuildPartsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findManyForOwner(
    ownerId: string,
    buildId: string,
    filter: BuildPartFilter,
  ): Promise<BuildPartEntity[]> {
    const installs = await this.prisma.buildPart.findMany({
      where: {
        buildId,
        // Scoped through the parent build's owner, so a guessed build id
        // returns nothing rather than someone else's components.
        build: { ownerId },
        ...(filter.installed ? { removedOn: null } : {}),
      },
      include: WITH_UNIT,
      orderBy: [{ removedOn: 'asc' }, { installedOn: 'desc' }],
    });

    return installs.map((install) => PrismaBuildPartsRepository.toEntity(install));
  }

  /**
   * Both sides are verified against the owner before the row is written. The
   * unit check is the one that matters: without it, a valid build id plus a
   * guessed unit id would fit somebody else's motor to your quad.
   *
   * The unit must also be free. One physical object cannot be on two quads at
   * once, and the database has no constraint that can say so — "fitted" is the
   * absence of a removal date, not a column a unique index can cover.
   */
  async install(
    ownerId: string,
    data: CreateBuildPartData,
  ): Promise<BuildPartEntity | null | 'occupied'> {
    const [build, unit] = await Promise.all([
      this.prisma.build.findFirst({
        where: { id: data.buildId, ownerId },
        select: { id: true },
      }),
      this.prisma.partUnit.findFirst({
        where: { id: data.unitId, part: { ownerId } },
        include: FITTED_COUNT,
      }),
    ]);

    if (!build || !unit) {
      return null;
    }

    if (unit._count.installs > 0) {
      return 'occupied';
    }

    const install = await this.prisma.buildPart.create({
      data: { ...data },
      include: WITH_UNIT,
    });

    return PrismaBuildPartsRepository.toEntity(install);
  }

  async remove(
    ownerId: string,
    buildId: string,
    installId: string,
    removedOn: Date,
  ): Promise<BuildPartEntity | null> {
    const { count } = await this.prisma.buildPart.updateMany({
      where: { id: installId, buildId, build: { ownerId }, removedOn: null },
      data: { removedOn },
    });

    if (count === 0) {
      return null;
    }

    const install = await this.prisma.buildPart.findUnique({
      where: { id: installId },
      include: WITH_UNIT,
    });

    return install ? PrismaBuildPartsRepository.toEntity(install) : null;
  }

  private static toEntity(install: InstallWithUnit): BuildPartEntity {
    return {
      id: install.id,
      buildId: install.buildId,
      unitId: install.unitId,
      position: install.position,
      installedOn: install.installedOn,
      removedOn: install.removedOn,
      reason: install.reason,
      unit: PrismaBuildPartsRepository.toUnitEntity(install.unit),
      part: PrismaBuildPartsRepository.toPartEntity(install.unit.part),
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

  private static toPartEntity(
    part: Part & { sources: PartSource[]; units: UnitWithInstalls[] },
  ): PartEntity {
    return {
      id: part.id,
      ownerId: part.ownerId,
      category: part.category,
      manufacturer: part.manufacturer,
      model: part.model,
      spec: (part.spec ?? {}) as PartSpec,
      notesMd: part.notesMd,
      units: part.units.map((unit) => PrismaBuildPartsRepository.toUnitEntity(unit)),
      sources: part.sources.map((source) =>
        PrismaBuildPartsRepository.toSourceEntity(source),
      ),
      createdAt: part.createdAt,
      updatedAt: part.updatedAt,
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

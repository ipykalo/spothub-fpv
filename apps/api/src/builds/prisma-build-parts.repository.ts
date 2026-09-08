import { Injectable } from '@nestjs/common';
import type { BuildPart, Part, PartSource } from '@prisma/client';
import type { PartSpec } from '@spothub/shared';

import { PrismaService } from '../prisma/prisma.service';
import type { PartEntity, PartSourceEntity } from '../parts/part.entity';
import type { BuildPartEntity, CreateBuildPartData } from './build-part.entity';
import { BuildPartFilter, BuildPartsRepository } from './build-parts.repository';

type InstallWithPart = BuildPart & {
  part: Part & { sources: PartSource[] };
};

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
      include: { part: { include: { sources: true } } },
      orderBy: [{ removedOn: 'asc' }, { installedOn: 'desc' }],
    });

    return installs.map((install) => PrismaBuildPartsRepository.toEntity(install));
  }

  /**
   * Both sides are verified against the owner before the row is written. The
   * part check is the one that matters: without it, a valid build id plus a
   * guessed part id would fit somebody else's motor to your quad.
   */
  async install(
    ownerId: string,
    data: CreateBuildPartData,
  ): Promise<BuildPartEntity | null> {
    const [build, part] = await Promise.all([
      this.prisma.build.findFirst({
        where: { id: data.buildId, ownerId },
        select: { id: true },
      }),
      this.prisma.part.findFirst({
        where: { id: data.partId, ownerId },
        select: { id: true },
      }),
    ]);

    if (!build || !part) {
      return null;
    }

    const install = await this.prisma.buildPart.create({
      data: { ...data },
      include: { part: { include: { sources: true } } },
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
      include: { part: { include: { sources: true } } },
    });

    return install ? PrismaBuildPartsRepository.toEntity(install) : null;
  }

  private static toEntity(install: InstallWithPart): BuildPartEntity {
    return {
      id: install.id,
      buildId: install.buildId,
      partId: install.partId,
      position: install.position,
      installedOn: install.installedOn,
      removedOn: install.removedOn,
      reason: install.reason,
      part: PrismaBuildPartsRepository.toPartEntity(install.part),
    };
  }

  private static toPartEntity(part: Part & { sources: PartSource[] }): PartEntity {
    return {
      id: part.id,
      ownerId: part.ownerId,
      category: part.category,
      manufacturer: part.manufacturer,
      model: part.model,
      spec: (part.spec ?? {}) as PartSpec,
      quantityOwned: part.quantityOwned,
      status: part.status,
      notesMd: part.notesMd,
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

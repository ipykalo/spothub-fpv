import { Injectable } from '@nestjs/common';
import type { BuildPart } from '@prisma/client';

import { PrismaService } from '../prisma';
import { BuildPartFilter, BuildPartsRepository } from './abstract/build-parts.repository';
import type { BuildPartEntity, CreateBuildPartData } from './build-part.entity';

/**
 * The only place this feature knows Prisma exists.
 *
 * It reads and writes `build_parts` and nothing else. The unit and part behind
 * an install used to be joined in here; they are now fetched through the parts
 * facade, which is what stopped this file re-implementing the parts module's
 * row mapping.
 */
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
      orderBy: [{ removedOn: 'asc' }, { installedOn: 'desc' }],
    });

    return installs.map(toEntity);
  }

  async isUnitFitted(unitId: string): Promise<boolean> {
    const open = await this.prisma.buildPart.findFirst({
      where: { unitId, removedOn: null },
      select: { id: true },
    });

    return open !== null;
  }

  /**
   * The build is verified against the owner before the row is written. The
   * matching check on the unit is the parts facade's job, and the service does
   * it first — without both, a valid build id plus a guessed unit id would fit
   * somebody else's motor to your quad.
   */
  async install(
    ownerId: string,
    data: CreateBuildPartData,
  ): Promise<BuildPartEntity | null> {
    const build = await this.prisma.build.findFirst({
      where: { id: data.buildId, ownerId },
      select: { id: true },
    });

    if (!build) {
      return null;
    }

    const install = await this.prisma.buildPart.create({ data: { ...data } });
    return toEntity(install);
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
    });

    return install ? toEntity(install) : null;
  }

  async linkRepairForOwner(
    ownerId: string,
    buildId: string,
    installId: string,
    repairId: string | null,
  ): Promise<boolean> {
    const { count } = await this.prisma.buildPart.updateMany({
      where: { id: installId, buildId, build: { ownerId } },
      data: { repairId },
    });

    return count > 0;
  }
}

function toEntity(install: BuildPart): BuildPartEntity {
  return {
    id: install.id,
    buildId: install.buildId,
    unitId: install.unitId,
    position: install.position,
    installedOn: install.installedOn,
    removedOn: install.removedOn,
    reason: install.reason,
    repairId: install.repairId,
  };
}

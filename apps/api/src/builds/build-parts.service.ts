import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  BuildCostDto,
  BuildPartDto,
  InstallPartDto,
  ListBuildPartsQuery,
  RemoveInstallDto,
} from '@spothub/shared';

import { BuildPartsRepository } from './build-parts.repository';
import { rollUpCost, toBuildCostDto, toBuildPartDto } from './build-parts.mapper';

/** Business rules for fitting parts. Knows nothing about HTTP or Prisma. */
@Injectable()
export class BuildPartsService {
  constructor(private readonly installs: BuildPartsRepository) {}

  async list(
    ownerId: string,
    buildId: string,
    query: ListBuildPartsQuery,
  ): Promise<BuildPartDto[]> {
    const installs = await this.installs.findManyForOwner(ownerId, buildId, query);
    return installs.map(toBuildPartDto);
  }

  /** The rollup only ever counts what is fitted right now. */
  async cost(ownerId: string, buildId: string): Promise<BuildCostDto> {
    const installs = await this.installs.findManyForOwner(ownerId, buildId, {
      installed: true,
    });

    return toBuildCostDto(rollUpCost(installs));
  }

  async install(
    ownerId: string,
    buildId: string,
    input: InstallPartDto,
  ): Promise<BuildPartDto> {
    const install = await this.installs.install(ownerId, {
      buildId,
      partId: input.partId,
      position: input.position,
      installedOn: toDate(input.installedOn),
      reason: input.reason,
    });

    if (!install) {
      throw new NotFoundException('Build or part not found');
    }

    return toBuildPartDto(install);
  }

  async remove(
    ownerId: string,
    buildId: string,
    installId: string,
    input: RemoveInstallDto,
  ): Promise<BuildPartDto> {
    const install = await this.installs.remove(
      ownerId,
      buildId,
      installId,
      toDate(input.removedOn),
    );

    if (!install) {
      throw new NotFoundException('Installed part not found');
    }

    return toBuildPartDto(install);
  }
}

/** `YYYY-MM-DD` is stored at UTC midnight so it round-trips as the same day. */
function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

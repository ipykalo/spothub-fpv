import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type {
  BuildCostDto,
  BuildPartDto,
  InstallPartDto,
  LinkInstallDto,
  ListBuildPartsQuery,
  RemoveInstallDto,
} from '@spothub/shared';

import { fromDateOnly } from '../common';
import { type FittedUnitDto, PartsFacade } from '../parts';
import { RepairsFacade } from '../repairs';
import { BuildPartsRepository } from './abstract/build-parts.repository';
import type { BuildPartEntity } from './build-part.entity';
import { rollUpCost, toBuildCostDto, toBuildPartDto } from './build-parts.mapper';

/**
 * Business rules for fitting parts. Knows nothing about HTTP or Prisma.
 *
 * It owns the `build_parts` row and nothing else. What a unit *is* comes from
 * the parts facade and whether a repair is real comes from the repairs facade,
 * so neither of those modules is reached into directly.
 */
@Injectable()
export class BuildPartsService {
  constructor(
    private readonly installs: BuildPartsRepository,
    private readonly parts: PartsFacade,
    private readonly repairs: RepairsFacade,
  ) {}

  async list(
    ownerId: string,
    buildId: string,
    query: ListBuildPartsQuery,
  ): Promise<BuildPartDto[]> {
    const installs = await this.installs.findManyForOwner(ownerId, buildId, query);
    const fitted = await this.hydrate(ownerId, installs);

    return installs.map((install) =>
      toBuildPartDto(install, lookUp(fitted, install.unitId)),
    );
  }

  /**
   * The parts rollup counts what is fitted right now; the repair rollup counts
   * every repair ever logged. Different questions, so they are reported side
   * by side rather than added.
   */
  async cost(ownerId: string, buildId: string): Promise<BuildCostDto> {
    const [installs, repairs] = await Promise.all([
      this.installs.findManyForOwner(ownerId, buildId, { installed: true }),
      this.repairs.costForBuild(ownerId, buildId),
    ]);

    const fitted = await this.hydrate(ownerId, installs);
    const parts = installs.map((install) => lookUp(fitted, install.unitId));

    return toBuildCostDto(rollUpCost(parts, repairs.totals, repairs.count));
  }

  async install(
    ownerId: string,
    buildId: string,
    input: InstallPartDto,
  ): Promise<BuildPartDto> {
    // The unit must be the owner's, or a valid build id plus a guessed unit id
    // would fit somebody else's motor to your quad.
    if (!(await this.parts.unitExists(ownerId, input.unitId))) {
      throw new NotFoundException('Build or part not found');
    }

    // One physical object cannot be on two quads at once, and the database has
    // no constraint that can say so — "fitted" is the absence of a removal
    // date, not a column a unique index can cover.
    if (await this.installs.isUnitFitted(input.unitId)) {
      throw new ConflictException('That unit is already fitted to a build');
    }

    if (input.repairId !== null) {
      await this.assertRepairExists(ownerId, buildId, input.repairId);
    }

    const install = await this.installs.install(ownerId, {
      buildId,
      unitId: input.unitId,
      position: input.position,
      installedOn: fromDateOnly(input.installedOn),
      reason: input.reason,
      repairId: input.repairId,
    });

    if (!install) {
      throw new NotFoundException('Build or part not found');
    }

    return this.toDto(ownerId, install);
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
      fromDateOnly(input.removedOn),
    );

    if (!install) {
      throw new NotFoundException('Installed part not found');
    }

    return this.toDto(ownerId, install);
  }

  /**
   * Blames an install on a repair, or clears the blame with null.
   *
   * The column lives on `build_parts`, so the write belongs here; that the
   * repair is real and on the same build is the repairs module's answer to
   * give, which is what stops an install being blamed on a crash that happened
   * to another quad.
   */
  async linkRepair(
    ownerId: string,
    buildId: string,
    installId: string,
    input: LinkInstallDto,
  ): Promise<void> {
    if (input.repairId !== null) {
      await this.assertRepairExists(ownerId, buildId, input.repairId);
    }

    const linked = await this.installs.linkRepairForOwner(
      ownerId,
      buildId,
      installId,
      input.repairId,
    );

    if (!linked) {
      throw new NotFoundException('Install or repair not found');
    }
  }

  private async assertRepairExists(
    ownerId: string,
    buildId: string,
    repairId: string,
  ): Promise<void> {
    if (!(await this.repairs.existsForBuild(ownerId, buildId, repairId))) {
      throw new NotFoundException('Install or repair not found');
    }
  }

  /** One batched call to the parts facade, whatever the size of the list. */
  private hydrate(
    ownerId: string,
    installs: readonly BuildPartEntity[],
  ): Promise<ReadonlyMap<string, FittedUnitDto>> {
    return this.parts.findUnits(
      ownerId,
      installs.map((install) => install.unitId),
    );
  }

  private async toDto(ownerId: string, install: BuildPartEntity): Promise<BuildPartDto> {
    const fitted = await this.hydrate(ownerId, [install]);
    return toBuildPartDto(install, lookUp(fitted, install.unitId));
  }
}

/**
 * A foreign key guarantees the unit is there, and it was checked against the
 * owner when the install was made — so a miss here is a broken invariant, not
 * a request problem, and must not be reported as a 404.
 */
function lookUp(
  fitted: ReadonlyMap<string, FittedUnitDto>,
  unitId: string,
): FittedUnitDto {
  const found = fitted.get(unitId);

  if (!found) {
    throw new InternalServerErrorException('Installed unit is missing');
  }

  return found;
}

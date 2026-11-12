import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  type AddStockPartsDto,
  type BuildCostDto,
  type BuildPartDto,
  type InstallPartDto,
  InstallReason,
  type LinkInstallDto,
  type ListBuildPartsQuery,
  type RemoveInstallDto,
  totalCurrencies,
} from '@spothub/shared';

import { type AuthenticatedUser, fromDateOnly } from '../common';
import { ExchangeRatesFacade } from '../exchange-rates';
import { type FittedUnitDto, PartsFacade } from '../parts';
import { RepairsFacade } from '../repairs';
import { BuildPartsRepository } from './abstract/build-parts.repository';
import type { BuildPartEntity } from './build-part.entity';
import {
  rollUpCost,
  toBuildCostDto,
  toBuildPartDto,
  withoutOwnersDetails,
} from './build-parts.mapper';

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
    private readonly rates: ExchangeRatesFacade,
  ) {}

  /**
   * What is fitted to a build the viewer may see. Someone it is shared with
   * sees what each part is, and what it cost or what the owner wrote about it
   * only where the owner switched that on. A build they cannot see lists
   * nothing, as before.
   */
  async list(
    viewer: AuthenticatedUser,
    buildId: string,
    query: ListBuildPartsQuery,
  ): Promise<BuildPartDto[]> {
    const viewerId = viewer.id;
    const access = await this.installs.findBuildAccessForViewer(viewerId, buildId);

    if (access === null) {
      return [];
    }

    const installs = await this.installs.findManyForOwner(access.ownerId, buildId, query);
    // Prices in the viewer's own currency. A reader the owner shares no costs
    // with loses the sources below, conversions and all.
    const fitted = await this.hydrate(access.ownerId, installs, viewer.homeCurrency);

    return installs.map((install) => {
      const dto = toBuildPartDto(install, lookUp(fitted, install.unitId));
      return viewerId === access.ownerId ? dto : withoutOwnersDetails(dto, access);
    });
  }

  /**
   * The parts rollup counts what is fitted right now; the repair rollup counts
   * every repair ever logged. Different questions, so they are reported side
   * by side rather than added.
   *
   * The owner's, unless they switched costs on for readers — and either way it
   * is the owner's own prices being totalled.
   */
  async cost(viewer: AuthenticatedUser, buildId: string): Promise<BuildCostDto> {
    const viewerId = viewer.id;
    const access = await this.installs.findBuildAccessForViewer(viewerId, buildId);

    // Someone who may not have it is told the build has no rollup, not that it
    // has one they may not see.
    if (access === null || (access.ownerId !== viewerId && !access.shareCosts)) {
      throw new NotFoundException('Build not found');
    }

    const ownerId = access.ownerId;
    const [installs, repairs] = await Promise.all([
      this.installs.findManyForOwner(ownerId, buildId, { installed: true }),
      this.repairs.costForBuild(ownerId, buildId),
    ]);

    const fitted = await this.hydrate(ownerId, installs);
    const parts = installs.map((install) => ({
      reason: install.reason,
      fitted: lookUp(fitted, install.unitId),
    }));

    const cost = rollUpCost(parts, access, repairs.totals, repairs.count);

    // In the viewer's own currency, then USD — whoever's build it is.
    const currencies = totalCurrencies(viewer.homeCurrency);
    const bought =
      access.boughtFor === null ? [] : [{ ...access.boughtFor, day: access.boughtOn }];
    const [totals, repairTotals, boughtFor] = await Promise.all([
      this.rates.totals(cost.spent, currencies),
      this.rates.totals(repairs.amounts, currencies),
      bought.length === 0 ? Promise.resolve([]) : this.rates.totals(bought, currencies),
    ]);

    return toBuildCostDto(cost, { totals, repairTotals, boughtFor });
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

  /**
   * The parts a quad came with, in one go: each line becomes a part on the
   * owner's shelf with its units, and every unit is fitted as INITIAL.
   *
   * The parts belong to the parts module, so they are made through its facade
   * and cannot share this module's transaction. The build is checked first, so
   * a stranger's id creates nothing; and if fitting fails after the parts were
   * made, they are taken back, so a failed batch leaves nothing on the shelf.
   */
  async addStock(
    ownerId: string,
    buildId: string,
    input: AddStockPartsDto,
  ): Promise<BuildPartDto[]> {
    const access = await this.installs.findBuildAccessForViewer(ownerId, buildId);

    if (access?.ownerId !== ownerId) {
      throw new NotFoundException('Build not found');
    }

    const parts = await this.parts.createWithUnits(
      ownerId,
      input.parts.map((line) => ({
        category: line.category,
        manufacturer: line.manufacturer,
        model: line.model,
        quantity: line.count,
      })),
    );

    const installedOn = fromDateOnly(input.installedOn);
    const rows = parts.flatMap((part) =>
      part.units.map((unit) => ({
        buildId,
        unitId: unit.id,
        position: null,
        installedOn,
        reason: InstallReason.Initial,
        repairId: null,
      })),
    );

    let installs: BuildPartEntity[] | null = null;

    try {
      installs = await this.installs.installMany(ownerId, buildId, rows);
    } finally {
      if (installs === null) {
        await this.parts.deleteParts(
          ownerId,
          parts.map((part) => part.id),
        );
      }
    }

    if (installs === null) {
      throw new NotFoundException('Build not found');
    }

    const fitted = await this.hydrate(ownerId, installs);
    return installs.map((install) =>
      toBuildPartDto(install, lookUp(fitted, install.unitId)),
    );
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

  /**
   * One batched call to the parts facade, whatever the size of the list. With
   * a currency, the parts' prices come converted into it for showing.
   */
  private hydrate(
    ownerId: string,
    installs: readonly BuildPartEntity[],
    convertInto?: string,
  ): Promise<ReadonlyMap<string, FittedUnitDto>> {
    return this.parts.findUnits(
      ownerId,
      installs.map((install) => install.unitId),
      convertInto,
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

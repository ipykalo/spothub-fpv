import { Injectable } from '@nestjs/common';

import { PartUnitsRepository } from './abstract/part-units.repository';
import { type FittedUnitDto, PartsFacade } from './abstract/parts.facade';
import { toPartUnitDto } from './mappers/part-units.mapper';
import { toPartDto } from './mappers/parts.mapper';

/** Serves the parts facade out of the module's own repositories. */
@Injectable()
export class PartsFacadeImpl extends PartsFacade {
  constructor(private readonly units: PartUnitsRepository) {
    super();
  }

  async findUnits(
    ownerId: string,
    unitIds: readonly string[],
  ): Promise<ReadonlyMap<string, FittedUnitDto>> {
    if (unitIds.length === 0) {
      return new Map();
    }

    const rows = await this.units.findManyWithPartForOwner(ownerId, unitIds);

    return new Map(
      rows.map((row) => [
        row.unit.id,
        { unit: toPartUnitDto(row.unit), part: toPartDto(row.part) },
      ]),
    );
  }

  unitExists(ownerId: string, unitId: string): Promise<boolean> {
    return this.units.existsForOwner(ownerId, unitId);
  }
}

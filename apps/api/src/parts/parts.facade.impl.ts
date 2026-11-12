import { Injectable } from '@nestjs/common';

import type { PartDto } from '@spothub/shared';

import { PartUnitsRepository } from './abstract/part-units.repository';
import {
  type FittedUnitDto,
  type NewPartWithUnits,
  PartsFacade,
} from './abstract/parts.facade';
import { PartsRepository } from './abstract/parts.repository';
import { toPartUnitDto } from './mappers/part-units.mapper';
import { toPartDto } from './mappers/parts.mapper';
import { SourcePrices } from './services/source-prices.service';

/** Serves the parts facade out of the module's own repositories. */
@Injectable()
export class PartsFacadeImpl extends PartsFacade {
  constructor(
    private readonly units: PartUnitsRepository,
    private readonly parts: PartsRepository,
    private readonly prices: SourcePrices,
  ) {
    super();
  }

  async findUnits(
    ownerId: string,
    unitIds: readonly string[],
    convertInto?: string,
  ): Promise<ReadonlyMap<string, FittedUnitDto>> {
    if (unitIds.length === 0) {
      return new Map();
    }

    const rows = await this.units.findManyWithPartForOwner(ownerId, unitIds);
    const parts = rows.map((row) => toPartDto(row.part));
    const shown =
      convertInto === undefined ? parts : await this.prices.convert(parts, convertInto);

    return new Map(
      rows.map((row, index) => [
        row.unit.id,
        { unit: toPartUnitDto(row.unit), part: shown[index] },
      ]),
    );
  }

  unitExists(ownerId: string, unitId: string): Promise<boolean> {
    return this.units.existsForOwner(ownerId, unitId);
  }

  async createWithUnits(
    ownerId: string,
    parts: readonly NewPartWithUnits[],
  ): Promise<PartDto[]> {
    const created = await this.parts.createMany(
      parts.map((part) => ({
        ownerId,
        category: part.category,
        manufacturer: part.manufacturer,
        model: part.model,
        spec: {},
        notesMd: null,
        quantity: part.quantity,
      })),
    );

    return created.map(toPartDto);
  }

  async deleteParts(ownerId: string, partIds: readonly string[]): Promise<void> {
    await this.parts.deleteManyForOwner(ownerId, partIds);
  }
}

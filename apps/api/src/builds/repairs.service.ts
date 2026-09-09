import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateRepairDto,
  LinkInstallDto,
  RepairDto,
  UpdateRepairDto,
} from '@spothub/shared';

import type { UpdateRepairData } from './repair.entity';
import { toRepairDto } from './repairs.mapper';
import { RepairsRepository } from './repairs.repository';

/** Business rules for repairs. Knows nothing about HTTP or Prisma. */
@Injectable()
export class RepairsService {
  constructor(private readonly repairs: RepairsRepository) {}

  async list(ownerId: string, buildId: string): Promise<RepairDto[]> {
    const repairs = await this.repairs.findManyForOwner(ownerId, buildId);
    return repairs.map(toRepairDto);
  }

  async create(
    ownerId: string,
    buildId: string,
    input: CreateRepairDto,
  ): Promise<RepairDto> {
    const repair = await this.repairs.create(ownerId, {
      buildId,
      occurredOn: toDate(input.occurredOn),
      cause: input.cause,
      descriptionMd: input.descriptionMd,
      cost: input.cost,
      currency: input.currency,
    });

    if (!repair) {
      throw new NotFoundException('Build not found');
    }

    return toRepairDto(repair);
  }

  async update(
    ownerId: string,
    buildId: string,
    repairId: string,
    input: UpdateRepairDto,
  ): Promise<RepairDto> {
    const repair = await this.repairs.updateForOwner(
      ownerId,
      buildId,
      repairId,
      toUpdateData(input),
    );

    if (!repair) {
      throw new NotFoundException('Repair not found');
    }

    return toRepairDto(repair);
  }

  async remove(ownerId: string, buildId: string, repairId: string): Promise<void> {
    const deleted = await this.repairs.deleteForOwner(ownerId, buildId, repairId);

    if (!deleted) {
      throw new NotFoundException('Repair not found');
    }
  }

  /** Blames an install on a repair, or clears the blame with null. */
  async linkInstall(
    ownerId: string,
    buildId: string,
    installId: string,
    input: LinkInstallDto,
  ): Promise<void> {
    const linked = await this.repairs.linkInstallForOwner(
      ownerId,
      buildId,
      installId,
      input.repairId,
    );

    if (!linked) {
      throw new NotFoundException('Install or repair not found');
    }
  }
}

/**
 * Copies only the keys actually present on the patch, so an absent field is
 * left alone rather than being written as null.
 */
function toUpdateData(input: UpdateRepairDto): UpdateRepairData {
  const data: UpdateRepairData = {};
  const patch = data as Record<string, unknown>;

  if (input.occurredOn !== undefined) patch['occurredOn'] = toDate(input.occurredOn);
  if (input.cause !== undefined) patch['cause'] = input.cause;
  if (input.descriptionMd !== undefined) patch['descriptionMd'] = input.descriptionMd;
  if (input.cost !== undefined) patch['cost'] = input.cost;
  if (input.currency !== undefined) patch['currency'] = input.currency;

  return data;
}

/** `YYYY-MM-DD` is stored at UTC midnight so it round-trips as the same day. */
function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

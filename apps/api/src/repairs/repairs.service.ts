import { Injectable, NotFoundException } from '@nestjs/common';
import {
  type CreateRepairDto,
  type RepairDto,
  type UpdateRepairDto,
  totalCurrencies,
} from '@spothub/shared';

import { type AuthenticatedUser, fromDateOnly } from '../common';
import { ExchangeRatesFacade } from '../exchange-rates';
import { RepairsRepository } from './abstract/repairs.repository';
import type { UpdateRepairData } from './repair.entity';
import { toRepairDto } from './repairs.mapper';

/** Business rules for repairs. Knows nothing about HTTP or Prisma. */
@Injectable()
export class RepairsService {
  constructor(
    private readonly repairs: RepairsRepository,
    private readonly rates: ExchangeRatesFacade,
  ) {}

  /**
   * The repair history of a build the viewer may see. Someone it is shared with
   * reads what broke and when, and what putting it right cost only where the
   * owner switched costs on. A build they cannot see lists nothing, as before.
   */
  async list(viewer: AuthenticatedUser, buildId: string): Promise<RepairDto[]> {
    const viewerId = viewer.id;
    const access = await this.repairs.findBuildAccessForViewer(viewerId, buildId);

    if (access === null) {
      return [];
    }

    const repairs = await this.repairs.findManyForOwner(access.ownerId, buildId);
    const withCosts = viewerId === access.ownerId || access.shareCosts;

    const dtos = repairs.map((repair) => {
      const dto = toRepairDto(repair);
      return withCosts ? dto : { ...dto, cost: null, currency: null };
    });

    return this.withConverted(dtos, viewer.homeCurrency);
  }

  async create(
    owner: AuthenticatedUser,
    buildId: string,
    input: CreateRepairDto,
  ): Promise<RepairDto> {
    const repair = await this.repairs.create(owner.id, {
      buildId,
      occurredOn: fromDateOnly(input.occurredOn),
      cause: input.cause,
      descriptionMd: input.descriptionMd,
      cost: input.cost,
      currency: input.currency,
    });

    if (!repair) {
      throw new NotFoundException('Build not found');
    }

    const [dto] = await this.withConverted([toRepairDto(repair)], owner.homeCurrency);
    return dto;
  }

  async update(
    owner: AuthenticatedUser,
    buildId: string,
    repairId: string,
    input: UpdateRepairDto,
  ): Promise<RepairDto> {
    const repair = await this.repairs.updateForOwner(
      owner.id,
      buildId,
      repairId,
      toUpdateData(input),
    );

    if (!repair) {
      throw new NotFoundException('Repair not found');
    }

    const [dto] = await this.withConverted([toRepairDto(repair)], owner.homeCurrency);
    return dto;
  }

  async remove(ownerId: string, buildId: string, repairId: string): Promise<void> {
    const deleted = await this.repairs.deleteForOwner(ownerId, buildId, repairId);

    if (!deleted) {
      throw new NotFoundException('Repair not found');
    }
  }

  /**
   * Each repair's cost in the viewer's own currency and USD, at the rate of
   * the day of the repair — one rate lookup for the whole list. A repair with
   * no cost, or one whose cost the reader is not given, converts to nothing.
   */
  private async withConverted(
    dtos: readonly RepairDto[],
    homeCurrency: string,
  ): Promise<RepairDto[]> {
    const priced = dtos.flatMap((dto) =>
      dto.cost === null || dto.currency === null
        ? []
        : [{ id: dto.id, amount: dto.cost, currency: dto.currency, day: dto.occurredOn }],
    );
    const converted = await this.rates.each(priced, totalCurrencies(homeCurrency));
    const byId = new Map(priced.map((entry, index) => [entry.id, converted[index]]));

    return dtos.map((dto) => ({ ...dto, converted: byId.get(dto.id) ?? [] }));
  }
}

/**
 * Copies only the keys actually present on the patch, so an absent field is
 * left alone rather than being written as null.
 */
function toUpdateData(input: UpdateRepairDto): UpdateRepairData {
  const data: UpdateRepairData = {};
  const patch = data as Record<string, unknown>;

  if (input.occurredOn !== undefined)
    patch['occurredOn'] = fromDateOnly(input.occurredOn);
  if (input.cause !== undefined) patch['cause'] = input.cause;
  if (input.descriptionMd !== undefined) patch['descriptionMd'] = input.descriptionMd;
  if (input.cost !== undefined) patch['cost'] = input.cost;
  if (input.currency !== undefined) patch['currency'] = input.currency;

  return data;
}

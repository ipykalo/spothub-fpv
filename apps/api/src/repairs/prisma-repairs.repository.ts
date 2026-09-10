import { Injectable } from '@nestjs/common';
import type { Repair } from '@prisma/client';

import { PrismaService } from '../prisma';
import type { CreateRepairData, RepairEntity, UpdateRepairData } from './repair.entity';
import { RepairsRepository } from './abstract/repairs.repository';

type RepairWithCount = Repair & { _count: { installs: number } };

const WITH_COUNT = { _count: { select: { installs: true } } };

/** The only place in this feature that knows Prisma exists. */
@Injectable()
export class PrismaRepairsRepository extends RepairsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findManyForOwner(ownerId: string, buildId: string): Promise<RepairEntity[]> {
    const repairs = await this.prisma.repair.findMany({
      // Scoped through the parent build's owner, so a guessed build id returns
      // nothing rather than someone else's crash log.
      where: { buildId, build: { ownerId } },
      include: WITH_COUNT,
      // Most recent first: a timeline is read from the latest thing that broke.
      orderBy: [{ occurredOn: 'desc' }, { createdAt: 'desc' }],
    });

    return repairs.map((repair) => PrismaRepairsRepository.toEntity(repair));
  }

  async create(ownerId: string, data: CreateRepairData): Promise<RepairEntity | null> {
    const owned = await this.prisma.build.findFirst({
      where: { id: data.buildId, ownerId },
      select: { id: true },
    });

    if (!owned) {
      return null;
    }

    const repair = await this.prisma.repair.create({
      data: { ...data },
      include: WITH_COUNT,
    });

    return PrismaRepairsRepository.toEntity(repair);
  }

  async updateForOwner(
    ownerId: string,
    buildId: string,
    repairId: string,
    data: UpdateRepairData,
  ): Promise<RepairEntity | null> {
    const { count } = await this.prisma.repair.updateMany({
      where: { id: repairId, buildId, build: { ownerId } },
      data: { ...data },
    });

    if (count === 0) {
      return null;
    }

    const repair = await this.prisma.repair.findUnique({
      where: { id: repairId },
      include: WITH_COUNT,
    });

    return repair ? PrismaRepairsRepository.toEntity(repair) : null;
  }

  async deleteForOwner(
    ownerId: string,
    buildId: string,
    repairId: string,
  ): Promise<boolean> {
    // The installs made during it survive: the foreign key is SET NULL, so
    // deleting the repair loses the story but not the history.
    const { count } = await this.prisma.repair.deleteMany({
      where: { id: repairId, buildId, build: { ownerId } },
    });

    return count > 0;
  }

  async existsForOwner(
    ownerId: string,
    buildId: string,
    repairId: string,
  ): Promise<boolean> {
    const repair = await this.prisma.repair.findFirst({
      where: { id: repairId, buildId, build: { ownerId } },
      select: { id: true },
    });

    return repair !== null;
  }

  /** `Decimal` is a Prisma type and must not escape this file. */
  private static toEntity(repair: RepairWithCount): RepairEntity {
    return {
      id: repair.id,
      buildId: repair.buildId,
      occurredOn: repair.occurredOn,
      cause: repair.cause,
      descriptionMd: repair.descriptionMd,
      cost: repair.cost === null ? null : repair.cost.toNumber(),
      currency: repair.currency,
      installCount: repair._count.installs,
      createdAt: repair.createdAt,
    };
  }
}

import { Injectable } from '@nestjs/common';
import type { Config } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { ConfigEntity, CreateConfigData } from './config.entity';
import { ConfigsRepository } from './configs.repository';

/**
 * Everything but `raw`.
 *
 * A build with a dozen captures would otherwise ship a dozen CLI dumps just to
 * render a list of dates and firmware versions.
 */
const WITHOUT_RAW = {
  id: true,
  buildId: true,
  capturedAt: true,
  kind: true,
  note: true,
  fwTarget: true,
  fwVersion: true,
  fwBuildDate: true,
  fwGitRev: true,
  mspApi: true,
  configRev: true,
  boardName: true,
  manufacturerId: true,
  mcuId: true,
  craftName: true,
} as const;

type ConfigSummary = Omit<Config, 'raw' | 'createdAt'>;

/** The only place in this feature that knows Prisma exists. */
@Injectable()
export class PrismaConfigsRepository extends ConfigsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findManyForOwner(ownerId: string, buildId: string): Promise<ConfigEntity[]> {
    const configs = await this.prisma.config.findMany({
      // Scoped through the parent build's owner, so a guessed build id returns
      // nothing rather than someone else's configuration.
      where: { buildId, build: { ownerId } },
      select: WITHOUT_RAW,
      // Newest first: "what is it running now" is the usual question.
      orderBy: [{ capturedAt: 'desc' }],
    });

    return configs.map((config) => PrismaConfigsRepository.toEntity(config));
  }

  async findOneForOwner(
    ownerId: string,
    buildId: string,
    configId: string,
  ): Promise<ConfigEntity | null> {
    const config = await this.prisma.config.findFirst({
      where: { id: configId, buildId, build: { ownerId } },
    });

    return config
      ? { ...PrismaConfigsRepository.toEntity(config), raw: config.raw }
      : null;
  }

  async create(ownerId: string, data: CreateConfigData): Promise<ConfigEntity | null> {
    const owned = await this.prisma.build.findFirst({
      where: { id: data.buildId, ownerId },
      select: { id: true },
    });

    if (!owned) {
      return null;
    }

    const config = await this.prisma.config.create({ data: { ...data } });
    return { ...PrismaConfigsRepository.toEntity(config), raw: config.raw };
  }

  async updateNoteForOwner(
    ownerId: string,
    buildId: string,
    configId: string,
    note: string | null,
  ): Promise<ConfigEntity | null> {
    const { count } = await this.prisma.config.updateMany({
      where: { id: configId, buildId, build: { ownerId } },
      data: { note },
    });

    if (count === 0) {
      return null;
    }

    const config = await this.prisma.config.findUnique({
      where: { id: configId },
      select: WITHOUT_RAW,
    });

    return config ? PrismaConfigsRepository.toEntity(config) : null;
  }

  async deleteForOwner(
    ownerId: string,
    buildId: string,
    configId: string,
  ): Promise<boolean> {
    const { count } = await this.prisma.config.deleteMany({
      where: { id: configId, buildId, build: { ownerId } },
    });

    return count > 0;
  }

  private static toEntity(config: ConfigSummary): ConfigEntity {
    return {
      id: config.id,
      buildId: config.buildId,
      capturedAt: config.capturedAt,
      kind: config.kind,
      note: config.note,
      fwTarget: config.fwTarget,
      fwVersion: config.fwVersion,
      fwBuildDate: config.fwBuildDate,
      fwGitRev: config.fwGitRev,
      mspApi: config.mspApi,
      configRev: config.configRev,
      boardName: config.boardName,
      manufacturerId: config.manufacturerId,
      mcuId: config.mcuId,
      craftName: config.craftName,
    };
  }
}

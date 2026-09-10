import { Injectable, NotFoundException } from '@nestjs/common';
import {
  type ConfigDto,
  type ConfigWithRawDto,
  type CreateConfigDto,
  type UpdateConfigDto,
  parseBetaflightConfig,
} from '@spothub/shared';

import { fromDateOnly } from '../common';
import { toConfigDto, toConfigWithRawDto } from './configs.mapper';
import { ConfigsRepository } from './abstract/configs.repository';

/** Business rules for firmware captures. Knows nothing about HTTP or Prisma. */
@Injectable()
export class ConfigsService {
  constructor(private readonly configs: ConfigsRepository) {}

  async list(ownerId: string, buildId: string): Promise<ConfigDto[]> {
    const configs = await this.configs.findManyForOwner(ownerId, buildId);
    return configs.map(toConfigDto);
  }

  async getOne(
    ownerId: string,
    buildId: string,
    configId: string,
  ): Promise<ConfigWithRawDto> {
    const config = await this.configs.findOneForOwner(ownerId, buildId, configId);

    if (!config) {
      throw new NotFoundException('Config not found');
    }

    return toConfigWithRawDto(config);
  }

  /**
   * Parses on the way in, once.
   *
   * The same parser runs in the paste form, so what was previewed is what gets
   * stored. The raw text is kept verbatim regardless of how much was
   * recognised — an unparseable capture is still the artefact, and a later
   * parser improvement can re-read it.
   */
  async create(
    ownerId: string,
    buildId: string,
    input: CreateConfigDto,
  ): Promise<ConfigWithRawDto> {
    const parsed = parseBetaflightConfig(input.raw);

    const config = await this.configs.create(ownerId, {
      buildId,
      kind: parsed.kind,
      raw: input.raw,
      note: input.note,
      fwTarget: parsed.fwTarget,
      fwVersion: parsed.fwVersion,
      fwBuildDate: parsed.fwBuildDate ? fromDateOnly(parsed.fwBuildDate) : null,
      fwGitRev: parsed.fwGitRev,
      mspApi: parsed.mspApi,
      configRev: parsed.configRev,
      boardName: parsed.boardName,
      manufacturerId: parsed.manufacturerId,
      mcuId: parsed.mcuId,
      craftName: parsed.craftName,
    });

    if (!config) {
      throw new NotFoundException('Build not found');
    }

    return toConfigWithRawDto(config);
  }

  async updateNote(
    ownerId: string,
    buildId: string,
    configId: string,
    input: UpdateConfigDto,
  ): Promise<ConfigDto> {
    const config = await this.configs.updateNoteForOwner(
      ownerId,
      buildId,
      configId,
      input.note,
    );

    if (!config) {
      throw new NotFoundException('Config not found');
    }

    return toConfigDto(config);
  }

  async remove(ownerId: string, buildId: string, configId: string): Promise<void> {
    const deleted = await this.configs.deleteForOwner(ownerId, buildId, configId);

    if (!deleted) {
      throw new NotFoundException('Config not found');
    }
  }
}

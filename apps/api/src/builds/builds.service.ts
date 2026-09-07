import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  BuildDto,
  CreateBuildDto,
  ListBuildsQuery,
  UpdateBuildDto,
} from '@spothub/shared';

import { uniqueSlug } from '../common/utils/slug.util';
import type { UpdateBuildData } from './build.entity';
import { toBuildDto } from './builds.mapper';
import { BuildsRepository } from './builds.repository';

/** Business rules for builds. Knows nothing about HTTP or Prisma. */
@Injectable()
export class BuildsService {
  constructor(private readonly builds: BuildsRepository) {}

  async list(ownerId: string, query: ListBuildsQuery): Promise<BuildDto[]> {
    const builds = await this.builds.findManyForOwner(ownerId, query);
    return builds.map(toBuildDto);
  }

  async getOne(ownerId: string, id: string): Promise<BuildDto> {
    const build = await this.builds.findOneForOwner(ownerId, id);

    if (!build) {
      throw new NotFoundException('Build not found');
    }

    return toBuildDto(build);
  }

  async create(ownerId: string, input: CreateBuildDto): Promise<BuildDto> {
    const slug = await uniqueSlug(input.name, (candidate) =>
      this.builds.slugExistsForOwner(ownerId, candidate),
    );

    const build = await this.builds.create({
      ownerId,
      slug,
      name: input.name,
      buildClass: input.buildClass,
      status: input.status,
      visibility: input.visibility,
      weightG: input.weightG,
      hasGps: input.hasGps,
      descriptionMd: input.descriptionMd,
      builtOn: toDate(input.builtOn),
      retiredOn: toDate(input.retiredOn),
    });

    return toBuildDto(build);
  }

  async update(ownerId: string, id: string, input: UpdateBuildDto): Promise<BuildDto> {
    const build = await this.builds.updateForOwner(ownerId, id, toUpdateData(input));

    if (!build) {
      throw new NotFoundException('Build not found');
    }

    return toBuildDto(build);
  }

  async remove(ownerId: string, id: string): Promise<void> {
    const deleted = await this.builds.deleteForOwner(ownerId, id);

    if (!deleted) {
      throw new NotFoundException('Build not found');
    }
  }
}

/**
 * Copies only the keys actually present on the patch, so an absent field is
 * left alone rather than being written as null.
 */
function toUpdateData(input: UpdateBuildDto): UpdateBuildData {
  const data: UpdateBuildData = {};
  const patch = data as Record<string, unknown>;

  if (input.name !== undefined) patch['name'] = input.name;
  if (input.buildClass !== undefined) patch['buildClass'] = input.buildClass;
  if (input.status !== undefined) patch['status'] = input.status;
  if (input.visibility !== undefined) patch['visibility'] = input.visibility;
  if (input.weightG !== undefined) patch['weightG'] = input.weightG;
  if (input.hasGps !== undefined) patch['hasGps'] = input.hasGps;
  if (input.descriptionMd !== undefined) patch['descriptionMd'] = input.descriptionMd;
  if (input.builtOn !== undefined) patch['builtOn'] = toDate(input.builtOn);
  if (input.retiredOn !== undefined) patch['retiredOn'] = toDate(input.retiredOn);

  return data;
}

/** `YYYY-MM-DD` is stored at UTC midnight so it round-trips as the same day. */
function toDate(value: string | null | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

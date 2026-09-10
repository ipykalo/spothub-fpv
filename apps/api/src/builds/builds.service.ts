import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  BuildDto,
  CreateBuildDto,
  ListBuildsQuery,
  UpdateBuildDto,
} from '@spothub/shared';

import { fromDateOnly, uniqueSlug } from '../common';
import { MediaFacade } from '../media';
import { BuildsRepository } from './abstract/builds.repository';
import type { BuildEntity, UpdateBuildData } from './build.entity';
import { toBuildDto } from './builds.mapper';

/** Business rules for builds. Knows nothing about HTTP, Prisma or storage. */
@Injectable()
export class BuildsService {
  constructor(
    private readonly builds: BuildsRepository,
    private readonly media: MediaFacade,
  ) {}

  async list(ownerId: string, query: ListBuildsQuery): Promise<BuildDto[]> {
    const builds = await this.builds.findManyForOwner(ownerId, query);
    return this.withCovers(ownerId, builds);
  }

  async getOne(ownerId: string, id: string): Promise<BuildDto> {
    const build = await this.builds.findOneForOwner(ownerId, id);

    if (!build) {
      throw new NotFoundException('Build not found');
    }

    return this.withCover(ownerId, build);
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
      builtOn: toNullableDate(input.builtOn),
      retiredOn: toNullableDate(input.retiredOn),
    });

    return this.withCover(ownerId, build);
  }

  async update(ownerId: string, id: string, input: UpdateBuildDto): Promise<BuildDto> {
    const build = await this.builds.updateForOwner(ownerId, id, toUpdateData(input));

    if (!build) {
      throw new NotFoundException('Build not found');
    }

    return this.withCover(ownerId, build);
  }

  async remove(ownerId: string, id: string): Promise<void> {
    const deleted = await this.builds.deleteForOwner(ownerId, id);

    if (!deleted) {
      throw new NotFoundException('Build not found');
    }
  }

  /**
   * One batched call to the media facade, whatever the length of the list —
   * signing is local, so a page of cards costs one query rather than one each.
   */
  private async withCovers(
    ownerId: string,
    builds: readonly BuildEntity[],
  ): Promise<BuildDto[]> {
    const ids = builds
      .map((build) => build.coverAssetId)
      .filter((id): id is string => id !== null);

    const urls = await this.media.urlsFor(ownerId, ids);

    return builds.map((build) =>
      toBuildDto(
        build,
        build.coverAssetId === null ? null : (urls.get(build.coverAssetId) ?? null),
      ),
    );
  }

  private async withCover(ownerId: string, build: BuildEntity): Promise<BuildDto> {
    if (build.coverAssetId === null) {
      return toBuildDto(build, null);
    }

    const urls = await this.media.urlsFor(ownerId, [build.coverAssetId]);
    return toBuildDto(build, urls.get(build.coverAssetId) ?? null);
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
  if (input.builtOn !== undefined) patch['builtOn'] = toNullableDate(input.builtOn);
  if (input.retiredOn !== undefined) patch['retiredOn'] = toNullableDate(input.retiredOn);

  return data;
}

const toNullableDate = (value: string | null | undefined): Date | null =>
  value ? fromDateOnly(value) : null;

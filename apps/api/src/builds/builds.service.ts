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

/**
 * Business rules for builds. Knows nothing about HTTP, Prisma or storage.
 *
 * Reading and writing are asked differently on purpose. Anyone signed in may
 * read a build shared with them; only its owner may change or delete it, and
 * those paths never go through the shared read.
 */
@Injectable()
export class BuildsService {
  constructor(
    private readonly builds: BuildsRepository,
    private readonly media: MediaFacade,
  ) {}

  /** The viewer's own builds. */
  async list(ownerId: string, query: ListBuildsQuery): Promise<BuildDto[]> {
    const builds = await this.builds.findManyForOwner(ownerId, query);
    return this.withCovers(ownerId, builds);
  }

  /** Other owners' Public builds. */
  async listShared(viewerId: string, query: ListBuildsQuery): Promise<BuildDto[]> {
    const builds = await this.builds.findSharedForViewer(viewerId, query);
    return this.withCovers(viewerId, builds);
  }

  /**
   * Every Public build, the viewer's own included — what a signed-out visitor
   * browses. `viewerId` is null for a visitor.
   */
  async listPublic(viewerId: string | null, query: ListBuildsQuery): Promise<BuildDto[]> {
    const builds = await this.builds.findPublic(query);
    return this.withCovers(viewerId, builds);
  }

  /**
   * The builds among these the viewer may open, in the order asked — what a
   * post shows of the builds it links. The rest are left out silently.
   */
  async listVisible(viewerId: string | null, ids: readonly string[]): Promise<BuildDto[]> {
    const found = new Map(
      (await this.builds.findManyVisibleForViewer(viewerId, ids)).map((build) => [build.id, build]),
    );
    const ordered = ids.flatMap((id) => {
      const build = found.get(id);
      return build ? [build] : [];
    });

    return this.withCovers(viewerId, ordered);
  }

  /**
   * The viewer's own build, or one shared as Public or Unlisted — which a
   * signed-out visitor (a null viewer) may open too. Anything else is not found.
   */
  async getOne(viewerId: string | null, id: string): Promise<BuildDto> {
    const build = await this.builds.findVisibleForViewer(viewerId, id);

    if (!build) {
      throw new NotFoundException('Build not found');
    }

    return this.withCover(viewerId, build);
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
   * One batched call to the media facade per owner — signing is local, so a
   * page of the viewer's own cards costs one query, and the shared list one
   * per pilot on it. A cover photo belongs to its build's owner, so that is
   * whose assets are looked up; whether the viewer may see the build was
   * settled by the read that found it.
   */
  private async withCovers(
    viewerId: string | null,
    builds: readonly BuildEntity[],
  ): Promise<BuildDto[]> {
    const coversByOwner = new Map<string, string[]>();

    for (const build of builds) {
      if (build.coverAssetId !== null) {
        const ids = coversByOwner.get(build.ownerId) ?? [];
        ids.push(build.coverAssetId);
        coversByOwner.set(build.ownerId, ids);
      }
    }

    const urls = new Map<string, string>();

    for (const [ownerId, ids] of coversByOwner) {
      for (const [id, url] of await this.media.urlsFor(ownerId, ids)) {
        urls.set(id, url);
      }
    }

    return builds.map((build) =>
      toBuildDto(
        build,
        build.coverAssetId === null ? null : (urls.get(build.coverAssetId) ?? null),
        viewerId,
      ),
    );
  }

  private async withCover(viewerId: string | null, build: BuildEntity): Promise<BuildDto> {
    const [dto] = await this.withCovers(viewerId, [build]);
    return dto;
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

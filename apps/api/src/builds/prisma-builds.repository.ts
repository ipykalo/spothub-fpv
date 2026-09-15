import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma';
import type { BuildEntity, CreateBuildData, UpdateBuildData } from './build.entity';
import { BuildFilter, BuildsRepository } from './abstract/builds.repository';

/**
 * The owner's display name rides along on every read — a join inside this
 * repository, and only the name: an owner's email never leaves the users
 * table through here.
 */
const WITH_OWNER_NAME = { owner: { select: { displayName: true } } } satisfies Prisma.BuildInclude;

type BuildRow = Prisma.BuildGetPayload<{ include: typeof WITH_OWNER_NAME }>;

/**
 * The only place in the builds feature that knows Prisma exists.
 */
@Injectable()
export class PrismaBuildsRepository extends BuildsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findManyForOwner(ownerId: string, filter: BuildFilter): Promise<BuildEntity[]> {
    const builds = await this.prisma.build.findMany({
      where: { ownerId, ...matching(filter) },
      include: WITH_OWNER_NAME,
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });

    return builds.map(toEntity);
  }

  async findOneForOwner(ownerId: string, id: string): Promise<BuildEntity | null> {
    const build = await this.prisma.build.findFirst({
      where: { id, ownerId },
      include: WITH_OWNER_NAME,
    });

    return build ? toEntity(build) : null;
  }

  async findVisibleForViewer(viewerId: string, id: string): Promise<BuildEntity | null> {
    const build = await this.prisma.build.findFirst({
      where: { id, OR: [{ ownerId: viewerId }, { visibility: { in: ['PUBLIC', 'UNLISTED'] } }] },
      include: WITH_OWNER_NAME,
    });

    return build ? toEntity(build) : null;
  }

  async findSharedForViewer(viewerId: string, filter: BuildFilter): Promise<BuildEntity[]> {
    const builds = await this.prisma.build.findMany({
      where: { visibility: 'PUBLIC', ownerId: { not: viewerId }, ...matching(filter) },
      include: WITH_OWNER_NAME,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });

    return builds.map(toEntity);
  }

  async slugExistsForOwner(ownerId: string, slug: string): Promise<boolean> {
    const found = await this.prisma.build.findUnique({
      where: { ownerId_slug: { ownerId, slug } },
      select: { id: true },
    });

    return found !== null;
  }

  async create(data: CreateBuildData): Promise<BuildEntity> {
    const build = await this.prisma.build.create({ data: { ...data }, include: WITH_OWNER_NAME });
    return toEntity(build);
  }

  /**
   * `updateMany` scoped by owner, then re-read. This makes it impossible to
   * update a row belonging to someone else, and returns null rather than
   * throwing when the id simply is not theirs.
   */
  async updateForOwner(
    ownerId: string,
    id: string,
    data: UpdateBuildData,
  ): Promise<BuildEntity | null> {
    const { count } = await this.prisma.build.updateMany({
      where: { id, ownerId },
      data: { ...data },
    });

    return count === 0 ? null : this.findOneForOwner(ownerId, id);
  }

  async deleteForOwner(ownerId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.build.deleteMany({ where: { id, ownerId } });
    return count > 0;
  }
}

/** The list filters, the same for the viewer's own builds and shared ones. */
function matching(filter: BuildFilter): Prisma.BuildWhereInput {
  return {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.search ? { name: { contains: filter.search, mode: 'insensitive' as const } } : {}),
  };
}

function toEntity(build: BuildRow): BuildEntity {
  return {
    id: build.id,
    ownerId: build.ownerId,
    ownerName: build.owner.displayName,
    name: build.name,
    slug: build.slug,
    buildClass: build.buildClass,
    status: build.status,
    visibility: build.visibility,
    weightG: build.weightG,
    hasGps: build.hasGps,
    descriptionMd: build.descriptionMd,
    coverAssetId: build.coverAssetId,
    builtOn: build.builtOn,
    retiredOn: build.retiredOn,
    createdAt: build.createdAt,
    updatedAt: build.updatedAt,
  };
}

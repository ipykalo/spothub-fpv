import { Injectable } from '@nestjs/common';
import type { Build } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { BuildEntity, CreateBuildData, UpdateBuildData } from './build.entity';
import { BuildFilter, BuildsRepository } from './builds.repository';

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
      where: {
        ownerId,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.search
          ? { name: { contains: filter.search, mode: 'insensitive' as const } }
          : {}),
      },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });

    return builds.map((build) => PrismaBuildsRepository.toEntity(build));
  }

  async findOneForOwner(ownerId: string, id: string): Promise<BuildEntity | null> {
    const build = await this.prisma.build.findFirst({ where: { id, ownerId } });
    return build ? PrismaBuildsRepository.toEntity(build) : null;
  }

  async slugExistsForOwner(ownerId: string, slug: string): Promise<boolean> {
    const found = await this.prisma.build.findUnique({
      where: { ownerId_slug: { ownerId, slug } },
      select: { id: true },
    });

    return found !== null;
  }

  async create(data: CreateBuildData): Promise<BuildEntity> {
    const build = await this.prisma.build.create({ data: { ...data } });
    return PrismaBuildsRepository.toEntity(build);
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

  private static toEntity(build: Build): BuildEntity {
    return {
      id: build.id,
      ownerId: build.ownerId,
      name: build.name,
      slug: build.slug,
      buildClass: build.buildClass,
      status: build.status,
      visibility: build.visibility,
      weightG: build.weightG,
      hasGps: build.hasGps,
      descriptionMd: build.descriptionMd,
      builtOn: build.builtOn,
      retiredOn: build.retiredOn,
      createdAt: build.createdAt,
      updatedAt: build.updatedAt,
    };
  }
}

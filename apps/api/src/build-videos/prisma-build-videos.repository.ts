import { Injectable } from '@nestjs/common';
import type { BuildVideo } from '@prisma/client';

import { PrismaService } from '../prisma';
import { BuildVideosRepository } from './abstract/build-videos.repository';
import type { BuildVideoEntity, CreateBuildVideoData } from './build-video.entity';

/** The only place in this feature that knows Prisma exists. */
@Injectable()
export class PrismaBuildVideosRepository extends BuildVideosRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findBuildOwnerVisibleToViewer(
    viewerId: string,
    buildId: string,
  ): Promise<string | null> {
    // The same rule as a build's own page: the viewer's build, or a shared one.
    const build = await this.prisma.build.findFirst({
      where: {
        id: buildId,
        OR: [{ ownerId: viewerId }, { visibility: { in: ['PUBLIC', 'UNLISTED'] } }],
      },
      select: { ownerId: true },
    });

    return build?.ownerId ?? null;
  }

  async findManyForOwner(ownerId: string, buildId: string): Promise<BuildVideoEntity[]> {
    const videos = await this.prisma.buildVideo.findMany({
      // Scoped through the parent build's owner, so a guessed id returns nothing.
      where: { buildId, build: { ownerId } },
      orderBy: { createdAt: 'desc' },
    });

    return videos.map((video) => PrismaBuildVideosRepository.toEntity(video));
  }

  async create(
    ownerId: string,
    data: CreateBuildVideoData,
    limit: number,
  ): Promise<BuildVideoEntity | 'full' | null> {
    return this.prisma.$transaction(async (tx) => {
      // Locks the build row, so two adds at once cannot both slip under the limit.
      const owned = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM builds WHERE id = ${data.buildId}::uuid AND owner_id = ${ownerId}::uuid FOR UPDATE`;

      if (owned.length === 0) {
        return null;
      }

      if ((await tx.buildVideo.count({ where: { buildId: data.buildId } })) >= limit) {
        return 'full';
      }

      const video = await tx.buildVideo.create({ data: { ...data } });
      return PrismaBuildVideosRepository.toEntity(video);
    });
  }

  async deleteForOwner(ownerId: string, buildId: string, videoId: string): Promise<boolean> {
    const { count } = await this.prisma.buildVideo.deleteMany({
      where: { id: videoId, buildId, build: { ownerId } },
    });

    return count > 0;
  }

  private static toEntity(video: BuildVideo): BuildVideoEntity {
    return {
      id: video.id,
      buildId: video.buildId,
      youtubeId: video.youtubeId,
      startS: video.startS,
      title: video.title,
      createdAt: video.createdAt,
    };
  }
}

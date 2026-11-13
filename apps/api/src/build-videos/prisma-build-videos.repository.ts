import { Injectable } from '@nestjs/common';
import type { BuildVideo } from '@prisma/client';

import { PrismaService } from '../prisma';
import { BuildVideosRepository } from './abstract/build-videos.repository';
import type {
  BuildVideoEntity,
  CoverlessVideo,
  CreateBuildVideoData,
} from './build-video.entity';

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

  async findOneForOwner(
    ownerId: string,
    videoId: string,
  ): Promise<BuildVideoEntity | null> {
    const video = await this.prisma.buildVideo.findFirst({
      where: { id: videoId, build: { ownerId } },
    });

    return video ? PrismaBuildVideosRepository.toEntity(video) : null;
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

  async setCoverForOwner(
    ownerId: string,
    videoId: string,
    coverStorageKey: string,
  ): Promise<boolean> {
    const { count } = await this.prisma.buildVideo.updateMany({
      where: { id: videoId, coverStorageKey: null, build: { ownerId } },
      data: { coverStorageKey },
    });

    return count > 0;
  }

  async deleteForOwner(
    ownerId: string,
    buildId: string,
    videoId: string,
  ): Promise<BuildVideoEntity | null> {
    const where = { id: videoId, buildId, build: { ownerId } };
    const video = await this.prisma.buildVideo.findFirst({ where });

    if (!video) {
      return null;
    }

    const { count } = await this.prisma.buildVideo.deleteMany({ where });
    return count > 0 ? PrismaBuildVideosRepository.toEntity(video) : null;
  }

  async findCoverless(after: string | null, limit: number): Promise<CoverlessVideo[]> {
    const videos = await this.prisma.buildVideo.findMany({
      where: { coverStorageKey: null, ...(after === null ? {} : { id: { gt: after } }) },
      orderBy: { id: 'asc' },
      take: limit,
      select: { id: true, buildId: true, build: { select: { ownerId: true } } },
    });

    return videos.map((video) => ({
      id: video.id,
      buildId: video.buildId,
      ownerId: video.build.ownerId,
    }));
  }

  private static toEntity(video: BuildVideo): BuildVideoEntity {
    return {
      id: video.id,
      buildId: video.buildId,
      youtubeId: video.youtubeId,
      startS: video.startS,
      title: video.title,
      coverStorageKey: video.coverStorageKey,
      createdAt: video.createdAt,
    };
  }
}

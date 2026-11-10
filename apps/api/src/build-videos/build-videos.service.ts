import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type BuildVideoDto,
  type CreateBuildVideoDto,
  MAX_BUILD_VIDEOS,
} from '@spothub/shared';

import { BuildVideosRepository } from './abstract/build-videos.repository';
import { toBuildVideoDto } from './build-videos.mapper';

/** A build's videos. Knows nothing about HTTP or Prisma. */
@Injectable()
export class BuildVideosService {
  constructor(private readonly videos: BuildVideosRepository) {}

  /**
   * The videos of a build the viewer may open. A build they cannot open
   * answers 404, the same as the build itself, rather than an empty list
   * that would confirm it exists.
   */
  async list(viewerId: string, buildId: string): Promise<BuildVideoDto[]> {
    const ownerId = await this.videos.findBuildOwnerVisibleToViewer(viewerId, buildId);

    if (ownerId === null) {
      throw new NotFoundException('Build not found');
    }

    const videos = await this.videos.findManyForOwner(ownerId, buildId);
    return videos.map(toBuildVideoDto);
  }

  async add(ownerId: string, buildId: string, input: CreateBuildVideoDto): Promise<BuildVideoDto> {
    const created = await this.videos.create(
      ownerId,
      {
        buildId,
        youtubeId: input.link.youtubeId,
        startS: input.link.startS,
        title: input.title,
      },
      MAX_BUILD_VIDEOS,
    );

    if (created === null) {
      throw new NotFoundException('Build not found');
    }

    if (created === 'full') {
      throw new ConflictException(
        `A build holds up to ${String(MAX_BUILD_VIDEOS)} videos. Remove one to add another.`,
      );
    }

    return toBuildVideoDto(created);
  }

  async remove(ownerId: string, buildId: string, videoId: string): Promise<void> {
    if (!(await this.videos.deleteForOwner(ownerId, buildId, videoId))) {
      throw new NotFoundException('Video not found');
    }
  }
}

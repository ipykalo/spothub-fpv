import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type BuildVideoDto,
  type CreateBuildVideoDto,
  MAX_BUILD_VIDEOS,
} from '@spothub/shared';

import type { Env } from '../config';
import { StorageGateway } from '../storage';
import { BuildVideosRepository } from './abstract/build-videos.repository';
import { BuildVideoCoverJob } from './build-video-cover.job';
import type { BuildVideoEntity } from './build-video.entity';
import { toBuildVideoDto } from './build-videos.mapper';

/** A build's videos. Knows nothing about HTTP or Prisma. */
@Injectable()
export class BuildVideosService {
  private readonly downloadTtl: number;

  constructor(
    private readonly videos: BuildVideosRepository,
    private readonly storage: StorageGateway,
    private readonly coverJob: BuildVideoCoverJob,
    config: ConfigService<Env, true>,
  ) {
    this.downloadTtl = config.get('S3_DOWNLOAD_URL_TTL', { infer: true });
  }

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
    return Promise.all(
      videos.map(async (video) => toBuildVideoDto(video, await this.coverUrlFor(video))),
    );
  }

  /** The cover comes a moment later, from the job; the video answers without one. */
  async add(
    ownerId: string,
    buildId: string,
    input: CreateBuildVideoDto,
  ): Promise<BuildVideoDto> {
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

    await this.coverJob.queue({ ownerId, buildId, videoId: created.id });
    return toBuildVideoDto(created, null);
  }

  async remove(ownerId: string, buildId: string, videoId: string): Promise<void> {
    const deleted = await this.videos.deleteForOwner(ownerId, buildId, videoId);

    if (!deleted) {
      throw new NotFoundException('Video not found');
    }

    if (deleted.coverStorageKey !== null) {
      await this.storage.delete([deleted.coverStorageKey]);
    }
  }

  private coverUrlFor(video: BuildVideoEntity): Promise<string | null> {
    return video.coverStorageKey === null
      ? Promise.resolve(null)
      : this.storage.presignGet(video.coverStorageKey, this.downloadTtl);
  }
}

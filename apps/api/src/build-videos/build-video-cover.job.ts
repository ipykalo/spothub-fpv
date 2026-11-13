import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleInit,
} from '@nestjs/common';
import { z } from 'zod';

import { JobQueue } from '../jobs';
import { StorageGateway } from '../storage';
import { VideoCovers } from '../youtube';
import { BuildVideosRepository } from './abstract/build-videos.repository';

/** The job that makes one build video's cover from its thumbnail. */
export const BUILD_VIDEO_COVER_JOB = 'build-video.cover';

/** Videos looked up at a time when queueing the ones without a cover. */
const BATCH = 100;

const payloadSchema = z.object({
  ownerId: z.uuid(),
  buildId: z.uuid(),
  videoId: z.uuid(),
});

export type BuildVideoCoverPayload = z.output<typeof payloadSchema>;

/**
 * Where a build video's cover lives: under the build, so deleting the build
 * clears the folder, and under the owner, so deleting the account does.
 */
export function buildVideoCoverKey(
  ownerId: string,
  buildId: string,
  videoId: string,
): string {
  return `${ownerId}/builds/${buildId}/video-${videoId}.webp`;
}

/**
 * Fetches a build video's thumbnail once, shrinks it, and keeps it in our
 * storage — the same as a spot's cover.
 *
 * In the background, because it waits on YouTube, and idempotent, because the
 * queue retries: a video deleted since the job was queued, or one that already
 * has a cover, is left alone. At start-up every video still without a cover is
 * queued, which is how videos added before covers existed get theirs; one
 * YouTube has no thumbnail for is asked about again at the next start.
 */
@Injectable()
export class BuildVideoCoverJob implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(BuildVideoCoverJob.name);

  constructor(
    private readonly jobs: JobQueue,
    private readonly videos: BuildVideosRepository,
    private readonly storage: StorageGateway,
    private readonly covers: VideoCovers,
  ) {}

  onModuleInit(): void {
    this.jobs.register(BUILD_VIDEO_COVER_JOB, (payload) =>
      this.run(payloadSchema.parse(payload)),
    );
  }

  async onApplicationBootstrap(): Promise<void> {
    let after: string | null = null;

    for (;;) {
      const page = await this.videos.findCoverless(after, BATCH);

      if (page.length === 0) {
        return;
      }

      for (const video of page) {
        after = video.id;
        await this.queue({
          ownerId: video.ownerId,
          buildId: video.buildId,
          videoId: video.id,
        });
      }
    }
  }

  async queue(payload: BuildVideoCoverPayload): Promise<void> {
    await this.jobs.enqueue(BUILD_VIDEO_COVER_JOB, payload);
  }

  /** The job's handler; public for the e2e suite. */
  async run({ ownerId, buildId, videoId }: BuildVideoCoverPayload): Promise<void> {
    const video = await this.videos.findOneForOwner(ownerId, videoId);

    // Deleted since this was queued (undefined is not null either), or a retry
    // after the cover was recorded.
    if (video?.coverStorageKey !== null) {
      return;
    }

    const cover = await this.covers.make(video.youtubeId);

    if (!cover) {
      this.logger.log(
        `YouTube has no thumbnail for ${video.youtubeId}; build video ${videoId} keeps no cover`,
      );
      return;
    }

    const key = buildVideoCoverKey(ownerId, buildId, videoId);
    await this.storage.put(key, cover, 'image/webp');

    if (!(await this.videos.setCoverForOwner(ownerId, videoId, key))) {
      // The video went while the image was being made; nothing points at it.
      await this.storage.delete([key]);
    }
  }
}

import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import sharp from 'sharp';
import { z } from 'zod';

import { JobQueue } from '../jobs';
import { StorageGateway } from '../storage';
import { SpotsRepository } from './abstract/spots.repository';
import { YouTubeThumbnails } from './abstract/youtube-thumbnails';

/** The job that makes a spot's cover image from its video's thumbnail. */
export const SPOT_COVER_JOB = 'spot.cover';

/** 16:9 like the player, and wide enough for a card on a large screen. */
const COVER_WIDTH = 640;
const COVER_HEIGHT = 360;

const payloadSchema = z.object({
  ownerId: z.uuid(),
  spotId: z.uuid(),
  youtubeId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
});

/** Where a spot's cover for one video lives. The video id in it makes a stale cover recognisable. */
export function coverKeyFor(ownerId: string, spotId: string, youtubeId: string): string {
  return `${ownerId}/spots/${spotId}/cover-${youtubeId}.webp`;
}

/**
 * Fetches a video's thumbnail once, shrinks it, and keeps it in our storage.
 *
 * In the background, because it waits on YouTube, and idempotent, because the
 * queue retries: a spot whose video has changed since the job was queued is
 * left alone, and a cover already recorded is not made twice.
 */
@Injectable()
export class SpotCoverJob implements OnModuleInit {
  private readonly logger = new Logger(SpotCoverJob.name);

  constructor(
    private readonly jobs: JobQueue,
    private readonly spots: SpotsRepository,
    private readonly storage: StorageGateway,
    private readonly thumbnails: YouTubeThumbnails,
  ) {}

  onModuleInit(): void {
    this.jobs.register(SPOT_COVER_JOB, (payload) => this.run(payload));
  }

  private async run(payload: Readonly<Record<string, unknown>>): Promise<void> {
    const { ownerId, spotId, youtubeId } = payloadSchema.parse(payload);
    const spot = await this.spots.findOneForOwner(ownerId, spotId);

    // Deleted, or given another video (or none) since this was queued.
    if (spot?.video?.youtubeId !== youtubeId) {
      return;
    }

    const key = coverKeyFor(ownerId, spotId, youtubeId);

    // A retry after the cover was already recorded.
    if (spot.coverStorageKey === key) {
      return;
    }

    const original = await this.thumbnails.fetch(youtubeId);

    if (!original) {
      this.logger.log(`YouTube has no thumbnail for ${youtubeId}; spot ${spotId} keeps no cover`);
      return;
    }

    // Re-encoded rather than copied: a fixed small WebP whatever YouTube sent,
    // and `cover` crops hqdefault's black letterbox bars away.
    const cover = await sharp(original, { failOn: 'error' })
      .resize(COVER_WIDTH, COVER_HEIGHT, { fit: 'cover' })
      .webp({ quality: 72 })
      .toBuffer();

    await this.storage.put(key, cover, 'image/webp');

    const recorded = await this.spots.setCoverForOwner(ownerId, spotId, youtubeId, key);

    if (!recorded) {
      // The video changed while the image was being made; nothing points at it.
      await this.storage.delete([key]);
    }
  }
}

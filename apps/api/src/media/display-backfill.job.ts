import { randomUUID } from 'node:crypto';

import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleInit,
} from '@nestjs/common';

import { JobQueue } from '../jobs';
import { StorageGateway } from '../storage';
import { AssetsRepository } from './abstract/assets.repository';
import sharp from 'sharp';

import { makeDisplayVersion, uprightSize } from './display-version';

/** The job that gives photos uploaded before display versions existed one each. */
export const DISPLAY_BACKFILL_JOB = 'asset.display-backfill';

/** Images read and resized at a time: a few MB each, so a handful, not hundreds. */
const BATCH = 10;

/**
 * Makes a display version for every image that has none — photos and post
 * images uploaded before commit made them.
 *
 * Queued once at start-up, and only when something is missing, so it is a
 * one-off in practice and a no-op afterwards. Idempotent, because the queue
 * retries: an image that gained a version meanwhile is left alone, and a
 * version made twice is taken back. One that cannot be read is logged and
 * skipped — a single broken file must not hold up the rest, and the next
 * start-up tries it again. Until an image has one, every address that wants
 * the display version falls back to the original.
 */
@Injectable()
export class DisplayBackfillJob implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(DisplayBackfillJob.name);

  constructor(
    private readonly jobs: JobQueue,
    private readonly assets: AssetsRepository,
    private readonly storage: StorageGateway,
  ) {}

  onModuleInit(): void {
    this.jobs.register(DISPLAY_BACKFILL_JOB, () => this.backfill());
  }

  async onApplicationBootstrap(): Promise<void> {
    const missing = await this.assets.findMissingDisplays(null, 1);

    if (missing.length > 0) {
      await this.jobs.enqueue(DISPLAY_BACKFILL_JOB, {});
    }
  }

  /** Every image without a display version gets one. The job's handler; public for the e2e suite. */
  async backfill(): Promise<void> {
    let after: string | null = null;
    let made = 0;
    let skipped = 0;

    for (;;) {
      const page = await this.assets.findMissingDisplays(after, BATCH);

      if (page.length === 0) {
        break;
      }

      for (const candidate of page) {
        after = candidate.id;

        try {
          if (await this.makeOne(candidate.ownerId, candidate.id, candidate.storageKey)) {
            made += 1;
          }
        } catch (error) {
          skipped += 1;
          this.logger.warn(`No display version for asset ${candidate.id}`, error);
        }
      }
    }

    if (made > 0 || skipped > 0) {
      this.logger.log(
        `Display versions made: ${String(made)}, skipped: ${String(skipped)}`,
      );
    }
  }

  private async makeOne(
    ownerId: string,
    assetId: string,
    storageKey: string,
  ): Promise<boolean> {
    const original = await this.storage.get(storageKey);

    if (!original) {
      throw new Error('The original is not in storage');
    }

    const display = await makeDisplayVersion(original.body);
    // Recorded again, upright: commit used to keep a phone photo's raw size.
    const upright = uprightSize(await sharp(original.body).metadata());
    const key = `${ownerId}/${randomUUID()}.webp`;

    if (!upright) {
      throw new Error('The original has no size');
    }

    await this.storage.put(key, display.bytes, 'image/webp');

    const attached = await this.assets.attachDisplayForOwner(
      ownerId,
      assetId,
      {
        storageKey: key,
        sizeBytes: display.bytes.byteLength,
        width: display.width,
        height: display.height,
      },
      upright,
    );

    // Deleted, or given one by a commit, while this was being made.
    if (!attached) {
      await this.storage.delete([key]);
    }

    return attached;
  }
}

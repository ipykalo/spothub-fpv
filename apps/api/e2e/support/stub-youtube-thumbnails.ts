import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

// Reaches past the spots module's barrel on purpose, as the blackbox stub
// does: YouTubeThumbnails is an infrastructure seam for a test harness, not
// part of the module's public API.
import { YouTubeThumbnails } from '../../src/spots/abstract/youtube-thumbnails';

/** A video id the stub has no thumbnail for, the way YouTube answers for a removed video. */
export const VIDEO_WITHOUT_THUMBNAIL = 'noThumbnail';

/**
 * Stands in for YouTube in e2e tests, so no test depends on a third party
 * being reachable or on somebody's video still existing.
 *
 * Every other id gets a generated image shaped like YouTube's `hqdefault` —
 * 4:3 — so a test also proves the job crops it to the cover's 16:9.
 */
@Injectable()
export class StubYouTubeThumbnails extends YouTubeThumbnails {
  fetch(youtubeId: string): Promise<Buffer | null> {
    if (youtubeId === VIDEO_WITHOUT_THUMBNAIL) {
      return Promise.resolve(null);
    }

    return sharp({
      create: { width: 480, height: 360, channels: 3, background: { r: 200, g: 60, b: 40 } },
    })
      .jpeg()
      .toBuffer();
  }
}

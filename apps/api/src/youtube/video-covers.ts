import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

import { YouTubeThumbnails } from './abstract/youtube-thumbnails';

/** 16:9 like the player, and wide enough for a card on a large screen. */
const COVER_WIDTH = 640;
const COVER_HEIGHT = 360;

/**
 * Makes the cover image for a YouTube video: its largest thumbnail, cropped to
 * a small WebP — what a spot and a build's videos show behind the play button,
 * from our own storage, so nobody's browser asks Google for it.
 */
@Injectable()
export class VideoCovers {
  constructor(private readonly thumbnails: YouTubeThumbnails) {}

  /**
   * The cover's bytes, or null when YouTube has no thumbnail for the video (a
   * removed or private one). Throws when YouTube could not be asked, so the
   * job that called it retries.
   */
  async make(youtubeId: string): Promise<Buffer | null> {
    const original = await this.thumbnails.fetch(youtubeId);

    if (!original) {
      return null;
    }

    // Re-encoded rather than copied: a fixed small WebP whatever YouTube sent,
    // and `cover` crops hqdefault's black letterbox bars away.
    return sharp(original, { failOn: 'error' })
      .resize(COVER_WIDTH, COVER_HEIGHT, { fit: 'cover' })
      .webp({ quality: 72 })
      .toBuffer();
  }
}

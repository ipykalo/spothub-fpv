import { Injectable } from '@nestjs/common';

import { YouTubeThumbnails } from './abstract/youtube-thumbnails';

/**
 * Largest first. `maxresdefault` exists only for HD uploads; `hqdefault`
 * exists for every video, letterboxed to 4:3, which the cover job crops.
 */
const SIZES = ['maxresdefault.jpg', 'hqdefault.jpg'] as const;

const TIMEOUT_MS = 10_000;

/** A thumbnail is tens of kilobytes; anything this large is not one. */
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * YouTube's public thumbnail images, fetched from the API's server. The only
 * place the app asks YouTube for anything on a viewer's behalf, and it asks
 * once per video, not once per person looking at a spot.
 */
@Injectable()
export class HttpYouTubeThumbnails extends YouTubeThumbnails {
  async fetch(youtubeId: string): Promise<Buffer | null> {
    for (const size of SIZES) {
      const response = await fetch(
        `https://i.ytimg.com/vi/${encodeURIComponent(youtubeId)}/${size}`,
        { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error' },
      );

      // A size the video lacks is a 404 — with a grey placeholder image as its
      // body, which must not become somebody's cover.
      if (response.status === 404) {
        continue;
      }

      if (!response.ok) {
        throw new Error(`YouTube answered ${String(response.status)} for thumbnail ${size}`);
      }

      if (!(response.headers.get('content-type') ?? '').startsWith('image/')) {
        throw new Error(`YouTube's thumbnail ${size} was not an image`);
      }

      const body = Buffer.from(await response.arrayBuffer());

      if (body.byteLength > MAX_BYTES) {
        throw new Error(`YouTube's thumbnail ${size} was too large to be one`);
      }

      return body;
    }

    return null;
  }
}

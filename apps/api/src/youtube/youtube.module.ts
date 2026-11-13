import { Module } from '@nestjs/common';

import { YouTubeThumbnails } from './abstract/youtube-thumbnails';
import { HttpYouTubeThumbnails } from './http-youtube-thumbnails';
import { VideoCovers } from './video-covers';

/**
 * YouTube's thumbnails, made into covers we store — infrastructure, like
 * `storage/`.
 *
 * It began inside `spots`, when a spot's video was the only one with a
 * cover. Build videos need the same, and a port private to one feature could
 * only have been reached through that feature's facade, which would have made
 * `spots` everyone's YouTube client. So the port, its adapter and the crop
 * live here, and any module imports them.
 */
@Module({
  providers: [
    { provide: YouTubeThumbnails, useClass: HttpYouTubeThumbnails },
    VideoCovers,
  ],
  exports: [VideoCovers],
})
export class YouTubeModule {}

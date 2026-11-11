import type { BuildVideoDto } from '@spothub/shared';

import type { BuildVideoEntity } from './build-video.entity';

/** The single place a video row becomes what the API answers. */
export function toBuildVideoDto(video: BuildVideoEntity): BuildVideoDto {
  return {
    id: video.id,
    buildId: video.buildId,
    youtubeId: video.youtubeId,
    startS: video.startS,
    title: video.title,
    createdAt: video.createdAt.toISOString(),
  };
}

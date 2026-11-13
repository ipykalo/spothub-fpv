import type { BuildVideoDto } from '@spothub/shared';

import type { BuildVideoEntity } from './build-video.entity';

/**
 * The single place a video row becomes what the API answers. The cover's
 * storage key stays inside; only a signed URL for it goes out.
 */
export function toBuildVideoDto(
  video: BuildVideoEntity,
  coverUrl: string | null,
): BuildVideoDto {
  return {
    id: video.id,
    buildId: video.buildId,
    youtubeId: video.youtubeId,
    startS: video.startS,
    title: video.title,
    coverUrl,
    createdAt: video.createdAt.toISOString(),
  };
}

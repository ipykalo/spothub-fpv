import type { SpotDto } from '@spothub/shared';

import type { SpotEntity } from './spot.entity';

/**
 * The single place a spot becomes a wire object. Explicit rather than a
 * spread, so a column added to the table is not silently published — the
 * cover's storage key stays inside; only a signed URL for it goes out.
 *
 * `viewerId` is whoever asked: the same spot answers `ownedByViewer: true` to
 * its owner and `false` to anyone it is shared with.
 */
export function toSpotDto(spot: SpotEntity, coverUrl: string | null, viewerId: string): SpotDto {
  return {
    id: spot.id,
    name: spot.name,
    slug: spot.slug,
    lat: spot.lat,
    lng: spot.lng,
    locality: spot.locality,
    terrain: spot.terrain,
    access: spot.access,
    difficulty: spot.difficulty,
    hazards: [...spot.hazards],
    descriptionMd: spot.descriptionMd,
    accessNotesMd: spot.accessNotesMd,
    visibility: spot.visibility,
    isDraft: spot.isDraft,
    video: spot.video ? { youtubeId: spot.video.youtubeId, startS: spot.video.startS } : null,
    coverUrl,
    ownedByViewer: spot.ownerId === viewerId,
    ownerName: spot.ownerName,
    createdAt: spot.createdAt.toISOString(),
    updatedAt: spot.updatedAt.toISOString(),
  };
}

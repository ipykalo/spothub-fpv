import type { BuildDto } from '@spothub/shared';

import { toNullableDateOnly } from '../common';
import type { BuildEntity } from './build.entity';

/**
 * The single place a domain entity becomes a wire object.
 *
 * Explicit rather than a spread, so a column added to the database is not
 * silently published by the API.
 *
 * The cover URL is passed in rather than derived: it is a short-lived
 * signature minted per response by the media module, and this module knows
 * nothing about how assets are stored. `viewerId` is whoever asked: the same
 * build answers `ownedByViewer: true` to its owner and `false` to anyone it is
 * shared with, or to a signed-out visitor (a null viewer).
 */
export function toBuildDto(
  build: BuildEntity,
  coverUrl: string | null,
  viewerId: string | null,
): BuildDto {
  return {
    id: build.id,
    name: build.name,
    slug: build.slug,
    buildClass: build.buildClass,
    status: build.status,
    visibility: build.visibility,
    weightG: build.weightG,
    hasGps: build.hasGps,
    descriptionMd: build.descriptionMd,
    coverAssetId: build.coverAssetId,
    coverUrl,
    builtOn: toNullableDateOnly(build.builtOn),
    retiredOn: toNullableDateOnly(build.retiredOn),
    ownedByViewer: build.ownerId === viewerId,
    ownerName: build.ownerName,
    createdAt: build.createdAt.toISOString(),
    updatedAt: build.updatedAt.toISOString(),
  };
}

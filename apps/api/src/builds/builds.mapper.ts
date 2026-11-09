import type { BuildDto, LikesDto } from '@spothub/shared';

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
 * shared with, or to a signed-out visitor (a null viewer). Its likes come
 * from the likes module, passed in the same way.
 *
 * What the quad cost and where it was bought are prices, so a reader sees
 * them only when the owner shared costs — whether it was bought at all is
 * not, and is shown to anyone who can open the build.
 */
export function toBuildDto(
  build: BuildEntity,
  coverUrl: string | null,
  viewerId: string | null,
  likes: LikesDto,
): BuildDto {
  const owned = build.ownerId === viewerId;
  const costs = owned || build.shareCosts;

  return {
    id: build.id,
    name: build.name,
    slug: build.slug,
    buildClass: build.buildClass,
    status: build.status,
    visibility: build.visibility,
    weightG: build.weightG,
    hasGps: build.hasGps,
    shareCosts: build.shareCosts,
    shareNotes: build.shareNotes,
    descriptionMd: build.descriptionMd,
    coverAssetId: build.coverAssetId,
    coverUrl,
    builtOn: toNullableDateOnly(build.builtOn),
    retiredOn: toNullableDateOnly(build.retiredOn),
    boughtComplete: build.boughtComplete,
    purchasePrice: costs ? build.purchasePrice : null,
    purchaseCurrency: costs ? build.purchaseCurrency : null,
    purchaseVendor: costs ? build.purchaseVendor : null,
    purchaseUrl: costs ? build.purchaseUrl : null,
    ownedByViewer: owned,
    ownerName: build.ownerName,
    likes,
    createdAt: build.createdAt.toISOString(),
    updatedAt: build.updatedAt.toISOString(),
  };
}

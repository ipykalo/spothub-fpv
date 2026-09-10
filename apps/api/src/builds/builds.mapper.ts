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
 * nothing about how assets are stored.
 */
export function toBuildDto(build: BuildEntity, coverUrl: string | null): BuildDto {
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
    createdAt: build.createdAt.toISOString(),
    updatedAt: build.updatedAt.toISOString(),
  };
}

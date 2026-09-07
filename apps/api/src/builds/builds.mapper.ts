import type { BuildDto } from '@spothub/shared';

import type { BuildEntity } from './build.entity';

/** Date-only columns must not leak a timezone-shifted timestamp to the client. */
const toDateOnly = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;

/**
 * The single place a domain entity becomes a wire object.
 *
 * Explicit rather than a spread, so a column added to the database is not
 * silently published by the API.
 */
export function toBuildDto(build: BuildEntity): BuildDto {
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
    builtOn: toDateOnly(build.builtOn),
    retiredOn: toDateOnly(build.retiredOn),
    createdAt: build.createdAt.toISOString(),
    updatedAt: build.updatedAt.toISOString(),
  };
}

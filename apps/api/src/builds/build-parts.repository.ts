import type { BuildPartEntity, CreateBuildPartData } from './build-part.entity';

export interface BuildPartFilter {
  /** True limits to what is fitted right now; omit for the full history. */
  readonly installed?: boolean;
}

/**
 * Persistence contract for installations.
 *
 * `ownerId` comes first on every method, as everywhere else. Both the build and
 * the part are re-checked against that owner before a row is written, so an
 * install cannot borrow somebody else's part or attach to their quad.
 */
export abstract class BuildPartsRepository {
  abstract findManyForOwner(
    ownerId: string,
    buildId: string,
    filter: BuildPartFilter,
  ): Promise<BuildPartEntity[]>;

  /** Null when either the build or the part is not the owner's. */
  abstract install(
    ownerId: string,
    data: CreateBuildPartData,
  ): Promise<BuildPartEntity | null>;

  /** Records an end date. The row survives — that is the point of the table. */
  abstract remove(
    ownerId: string,
    buildId: string,
    installId: string,
    removedOn: Date,
  ): Promise<BuildPartEntity | null>;
}

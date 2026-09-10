import type { BuildPartEntity, CreateBuildPartData } from '../build-part.entity';

export interface BuildPartFilter {
  /** True limits to what is fitted right now; omit for the full history. */
  readonly installed?: boolean;
}

/**
 * Persistence contract for installations.
 *
 * `ownerId` comes first on every method, as everywhere else. The build is
 * re-checked against that owner before a row is written, so an install cannot
 * attach to somebody else's quad. That the *unit* is the owner's is a parts
 * question and is asked through the parts facade before we get here.
 */
export abstract class BuildPartsRepository {
  abstract findManyForOwner(
    ownerId: string,
    buildId: string,
    filter: BuildPartFilter,
  ): Promise<BuildPartEntity[]>;

  /**
   * Whether the unit is on a quad right now.
   *
   * Reads this module's own table: "fitted" is the absence of a removal date,
   * not a column on the unit, so no database constraint can express it.
   */
  abstract isUnitFitted(unitId: string): Promise<boolean>;

  /** Null when the build is not the owner's. */
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

  /**
   * Sets or clears `build_parts.repairId`.
   *
   * This module owns that column. That the repair is real and belongs to the
   * same build is checked through the repairs facade before we get here.
   */
  abstract linkRepairForOwner(
    ownerId: string,
    buildId: string,
    installId: string,
    repairId: string | null,
  ): Promise<boolean>;
}

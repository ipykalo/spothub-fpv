import type { CreateRepairData, RepairEntity, UpdateRepairData } from '../repair.entity';

/**
 * Persistence contract for repairs.
 *
 * `ownerId` comes first on every method, as everywhere else. Repairs are
 * reached through their build, so the ownership check runs against the parent
 * rather than the repair row.
 */
export abstract class RepairsRepository {
  abstract findManyForOwner(ownerId: string, buildId: string): Promise<RepairEntity[]>;

  abstract create(ownerId: string, data: CreateRepairData): Promise<RepairEntity | null>;

  abstract updateForOwner(
    ownerId: string,
    buildId: string,
    repairId: string,
    data: UpdateRepairData,
  ): Promise<RepairEntity | null>;

  abstract deleteForOwner(
    ownerId: string,
    buildId: string,
    repairId: string,
  ): Promise<boolean>;

  /**
   * Whether the repair exists, sits on this build and belongs to this owner.
   *
   * Backs the facade. The build-parts module asks before blaming an install on
   * a repair, which is what stops an install being attributed to a crash that
   * happened to another quad.
   */
  abstract existsForOwner(
    ownerId: string,
    buildId: string,
    repairId: string,
  ): Promise<boolean>;
}

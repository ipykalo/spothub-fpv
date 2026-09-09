import type { CreateRepairData, RepairEntity, UpdateRepairData } from './repair.entity';

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
   * Attaches an install to a repair, or clears the link with null.
   *
   * Both rows are checked against the same build, so an install cannot be
   * blamed on a crash that happened to another quad.
   */
  abstract linkInstallForOwner(
    ownerId: string,
    buildId: string,
    installId: string,
    repairId: string | null,
  ): Promise<boolean>;
}

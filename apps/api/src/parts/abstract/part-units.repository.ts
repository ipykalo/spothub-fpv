import type { PartEntity } from '../entities/part.entity';
import type {
  CreatePartUnitData,
  PartUnitEntity,
  UpdatePartUnitData,
} from '../entities/part-unit.entity';

/** A unit together with the kind of part it is one of. */
export interface PartUnitWithPart {
  readonly unit: PartUnitEntity;
  readonly part: PartEntity;
}

/**
 * Persistence contract for physical units.
 *
 * Units are reached through their parent part, so `ownerId` is checked against
 * that parent — the same rule as everywhere else, one level up.
 */
export abstract class PartUnitsRepository {
  /**
   * Loads units by id with their part attached.
   *
   * Batched deliberately: this is what backs the parts facade, and the caller
   * is hydrating a whole list of installs at once.
   */
  abstract findManyWithPartForOwner(
    ownerId: string,
    unitIds: readonly string[],
  ): Promise<PartUnitWithPart[]>;

  abstract existsForOwner(ownerId: string, unitId: string): Promise<boolean>;

  abstract addForOwner(
    ownerId: string,
    partId: string,
    data: CreatePartUnitData,
  ): Promise<PartUnitEntity | null>;

  abstract updateForOwner(
    ownerId: string,
    partId: string,
    unitId: string,
    data: UpdatePartUnitData,
  ): Promise<PartUnitEntity | null>;

  /** Refuses while the unit is fitted: removing it would orphan an install. */
  abstract deleteForOwner(
    ownerId: string,
    partId: string,
    unitId: string,
  ): Promise<'deleted' | 'fitted' | 'missing'>;
}

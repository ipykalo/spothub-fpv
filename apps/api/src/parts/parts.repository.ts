import type { PartCategory, PartCondition } from '@spothub/shared';

import type {
  CreatePartData,
  CreatePartSourceData,
  CreatePartUnitData,
  PartEntity,
  PartSourceEntity,
  PartUnitEntity,
  UpdatePartData,
  UpdatePartSourceData,
  UpdatePartUnitData,
} from './part.entity';

export interface PartFilter {
  readonly category?: PartCategory;
  /** Matches parts having at least one unit in this condition. */
  readonly condition?: PartCondition;
  readonly search?: string;
}

/**
 * Persistence contract for parts.
 *
 * Every method takes `ownerId` as its first argument, including the ones that
 * reach a source through its parent part: the ownership check lives in the
 * signature, so a query that forgets it does not compile.
 */
export abstract class PartsRepository {
  abstract findManyForOwner(ownerId: string, filter: PartFilter): Promise<PartEntity[]>;

  abstract findOneForOwner(ownerId: string, id: string): Promise<PartEntity | null>;

  abstract create(data: CreatePartData): Promise<PartEntity>;

  abstract updateForOwner(
    ownerId: string,
    id: string,
    data: UpdatePartData,
  ): Promise<PartEntity | null>;

  abstract deleteForOwner(ownerId: string, id: string): Promise<boolean>;

  abstract addSourceForOwner(
    ownerId: string,
    partId: string,
    data: CreatePartSourceData,
  ): Promise<PartSourceEntity | null>;

  abstract updateSourceForOwner(
    ownerId: string,
    partId: string,
    sourceId: string,
    data: UpdatePartSourceData,
  ): Promise<PartSourceEntity | null>;

  abstract deleteSourceForOwner(
    ownerId: string,
    partId: string,
    sourceId: string,
  ): Promise<boolean>;

  abstract addUnitForOwner(
    ownerId: string,
    partId: string,
    data: CreatePartUnitData,
  ): Promise<PartUnitEntity | null>;

  abstract updateUnitForOwner(
    ownerId: string,
    partId: string,
    unitId: string,
    data: UpdatePartUnitData,
  ): Promise<PartUnitEntity | null>;

  /** Refuses while the unit is fitted: removing it would orphan an install. */
  abstract deleteUnitForOwner(
    ownerId: string,
    partId: string,
    unitId: string,
  ): Promise<'deleted' | 'fitted' | 'missing'>;
}

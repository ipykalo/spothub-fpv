import type { PartCategory, PartCondition } from '@spothub/shared';

import type { CreatePartData, PartEntity, UpdatePartData } from '../entities/part.entity';

export interface PartFilter {
  readonly category?: PartCategory;
  /** Matches parts having at least one unit in this condition. */
  readonly condition?: PartCondition;
  readonly search?: string;
}

/**
 * Persistence contract for the part catalogue.
 *
 * Every method takes `ownerId` as its first argument: the ownership check
 * lives in the signature, so a query that forgets it does not compile.
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
}

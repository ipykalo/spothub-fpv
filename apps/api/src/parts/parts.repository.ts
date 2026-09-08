import type { PartCategory, PartStatus } from '@spothub/shared';

import type {
  CreatePartData,
  CreatePartSourceData,
  PartEntity,
  PartSourceEntity,
  UpdatePartData,
} from './part.entity';

export interface PartFilter {
  readonly category?: PartCategory;
  readonly status?: PartStatus;
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

  abstract deleteSourceForOwner(
    ownerId: string,
    partId: string,
    sourceId: string,
  ): Promise<boolean>;
}

import type { BuildStatus } from '@spothub/shared';

import type { BuildEntity, CreateBuildData, UpdateBuildData } from '../build.entity';

export interface BuildFilter {
  readonly status?: BuildStatus;
  readonly search?: string;
}

/**
 * Persistence contract for builds.
 *
 * Every method takes `ownerId` as its first argument. That is deliberate: the
 * ownership check lives in the signature, so it is impossible to write a query
 * that forgets it. Opening the app to more users needs no change here.
 */
export abstract class BuildsRepository {
  abstract findManyForOwner(ownerId: string, filter: BuildFilter): Promise<BuildEntity[]>;

  abstract findOneForOwner(ownerId: string, id: string): Promise<BuildEntity | null>;

  abstract slugExistsForOwner(ownerId: string, slug: string): Promise<boolean>;

  abstract create(data: CreateBuildData): Promise<BuildEntity>;

  abstract updateForOwner(
    ownerId: string,
    id: string,
    data: UpdateBuildData,
  ): Promise<BuildEntity | null>;

  abstract deleteForOwner(ownerId: string, id: string): Promise<boolean>;
}

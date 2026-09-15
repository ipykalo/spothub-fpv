import type { CreateSpotData, SpotEntity, UpdateSpotData } from '../spot.entity';

/**
 * Persistence contract for spots.
 *
 * `ownerId` first on every method, as everywhere else: the ownership check is
 * in the signature, so a query that forgets it cannot be written.
 */
export abstract class SpotsRepository {
  /** Every spot the owner has, most recently changed first. */
  abstract findManyForOwner(ownerId: string): Promise<SpotEntity[]>;

  abstract findOneForOwner(ownerId: string, id: string): Promise<SpotEntity | null>;

  abstract slugExistsForOwner(ownerId: string, slug: string): Promise<boolean>;

  abstract create(data: CreateSpotData): Promise<SpotEntity>;

  abstract updateForOwner(
    ownerId: string,
    id: string,
    data: UpdateSpotData,
  ): Promise<SpotEntity | null>;

  abstract deleteForOwner(ownerId: string, id: string): Promise<boolean>;
}

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

  /**
   * Records a cover made for `youtubeId` — only while the spot still has that
   * video. False when it does not, so the job can throw away what it made.
   */
  abstract setCoverForOwner(
    ownerId: string,
    id: string,
    youtubeId: string,
    coverStorageKey: string,
  ): Promise<boolean>;

  abstract deleteForOwner(ownerId: string, id: string): Promise<boolean>;
}

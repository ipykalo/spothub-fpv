import type { CreateSpotData, SpotEntity, UpdateSpotData } from '../spot.entity';

/**
 * Persistence contract for spots.
 *
 * The person acting comes first on every method, as everywhere else. Writes
 * take the owner, so a query that forgets whose spot it is cannot be written.
 * Reads of someone else's spot take the viewer instead, and say in their name
 * exactly what they let through: a spot shared as Public or Unlisted, and
 * never a draft.
 */
export abstract class SpotsRepository {
  /** Every spot the owner has, most recently changed first. */
  abstract findManyForOwner(ownerId: string): Promise<SpotEntity[]>;

  abstract findOneForOwner(ownerId: string, id: string): Promise<SpotEntity | null>;

  /** A spot the viewer owns, or one another owner shared as Public or Unlisted and finished. */
  abstract findVisibleForViewer(viewerId: string, id: string): Promise<SpotEntity | null>;

  /**
   * Other owners' Public spots, most recently changed first. Unlisted spots
   * are left out on purpose: they open only for someone given the link.
   */
  abstract findSharedForViewer(viewerId: string): Promise<SpotEntity[]>;

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

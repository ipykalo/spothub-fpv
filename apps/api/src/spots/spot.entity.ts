import type {
  SpotAccess,
  SpotHazard,
  SpotTerrain,
  Visibility,
  YouTubeVideo,
} from '@spothub/shared';

/** A spot as the domain understands it — no ORM types, coordinates as plain numbers. */
export interface SpotEntity {
  readonly id: string;
  readonly ownerId: string;
  readonly name: string;
  readonly slug: string;
  readonly lat: number;
  readonly lng: number;
  readonly locality: string | null;
  readonly terrain: SpotTerrain | null;
  readonly access: SpotAccess;
  readonly difficulty: number | null;
  readonly hazards: readonly SpotHazard[];
  readonly descriptionMd: string | null;
  readonly accessNotesMd: string | null;
  readonly visibility: Visibility;
  readonly isDraft: boolean;
  /** The spot's one flight video on YouTube, if it has one. */
  readonly video: YouTubeVideo | null;
  /** The storage key of the cover made from the video's thumbnail, once made. */
  readonly coverStorageKey: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Fields the persistence layer accepts on create. A new spot has no cover yet. */
export interface CreateSpotData {
  readonly ownerId: string;
  readonly slug: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly locality: string | null;
  readonly terrain: SpotTerrain | null;
  readonly access: SpotAccess;
  readonly difficulty: number | null;
  readonly hazards: readonly SpotHazard[];
  readonly descriptionMd: string | null;
  readonly accessNotesMd: string | null;
  readonly visibility: Visibility;
  readonly isDraft: boolean;
  readonly video: YouTubeVideo | null;
}

/**
 * A sparse patch: only the keys present are written. The slug is normally
 * left as it was created, so a renamed spot keeps its address — the one
 * exception is finishing a draft, whose placeholder slug is replaced once.
 * `coverStorageKey` is only ever cleared here, when the video changes; the
 * cover job records a new one through `setCoverForOwner`.
 */
export type UpdateSpotData = Partial<Omit<CreateSpotData, 'ownerId'>> & {
  readonly coverStorageKey?: null;
};

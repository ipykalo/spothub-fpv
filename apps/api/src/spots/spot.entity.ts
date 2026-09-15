import type { SpotAccess, SpotHazard, SpotTerrain, Visibility } from '@spothub/shared';

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
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Fields the persistence layer accepts on create. */
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
}

/**
 * A sparse patch: only the keys present are written. The slug stays as it was
 * created, so a renamed spot keeps its address.
 */
export type UpdateSpotData = Partial<Omit<CreateSpotData, 'ownerId' | 'slug'>>;

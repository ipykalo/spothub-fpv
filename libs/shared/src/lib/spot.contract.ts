import { z } from 'zod';

import { Visibility } from './enums';
import { youTubeLinkSchema, youTubeVideoSchema } from './youtube';

/**
 * The spot contract: a place to fly, defined once for both sides of the wire.
 *
 * A spot is somewhere; a flight is something that happened. They are kept
 * apart on purpose — a spot is written by hand, with the coordinates, the
 * ground and the rules of the place, and nothing about it is derived from a
 * log.
 */

export const SpotTerrain = {
  Field: 'FIELD',
  Park: 'PARK',
  /** Abandoned buildings and ruins. */
  Bando: 'BANDO',
  Forest: 'FOREST',
  Quarry: 'QUARRY',
  Mountain: 'MOUNTAIN',
  Water: 'WATER',
  Urban: 'URBAN',
  Track: 'TRACK',
  Other: 'OTHER',
} as const;
export type SpotTerrain = (typeof SpotTerrain)[keyof typeof SpotTerrain];

export const SPOT_TERRAIN_LABELS: Readonly<Record<SpotTerrain, string>> = {
  [SpotTerrain.Field]: 'Open field',
  [SpotTerrain.Park]: 'Park',
  [SpotTerrain.Bando]: 'Bando / ruins',
  [SpotTerrain.Forest]: 'Forest',
  [SpotTerrain.Quarry]: 'Quarry',
  [SpotTerrain.Mountain]: 'Hills / mountain',
  [SpotTerrain.Water]: 'Lake / coast',
  [SpotTerrain.Urban]: 'Urban',
  [SpotTerrain.Track]: 'Race track',
  [SpotTerrain.Other]: 'Other',
};

export const SpotHazard = {
  Powerlines: 'POWERLINES',
  People: 'PEOPLE',
  Traffic: 'TRAFFIC',
  Trees: 'TREES',
  Water: 'WATER',
  Animals: 'ANIMALS',
  Airspace: 'AIRSPACE',
  PrivateLand: 'PRIVATE_LAND',
} as const;
export type SpotHazard = (typeof SpotHazard)[keyof typeof SpotHazard];

export const SPOT_HAZARD_LABELS: Readonly<Record<SpotHazard, string>> = {
  [SpotHazard.Powerlines]: 'Power lines',
  [SpotHazard.People]: 'People around',
  [SpotHazard.Traffic]: 'Roads / traffic',
  [SpotHazard.Trees]: 'Tall trees',
  [SpotHazard.Water]: 'Water',
  [SpotHazard.Animals]: 'Livestock / wildlife',
  [SpotHazard.Airspace]: 'Restricted airspace nearby',
  [SpotHazard.PrivateLand]: 'Private land',
};

/** Whether flying there is allowed — as far as the owner knows, which is all anyone can record. */
export const SpotAccess = {
  Open: 'OPEN',
  AskFirst: 'ASK_FIRST',
  Restricted: 'RESTRICTED',
  Unknown: 'UNKNOWN',
} as const;
export type SpotAccess = (typeof SpotAccess)[keyof typeof SpotAccess];

export const SPOT_ACCESS_LABELS: Readonly<Record<SpotAccess, string>> = {
  [SpotAccess.Open]: 'Open to fly',
  [SpotAccess.AskFirst]: 'Ask first',
  [SpotAccess.Restricted]: 'Restricted',
  [SpotAccess.Unknown]: 'Not sure',
};

export const MIN_SPOT_DIFFICULTY = 1;
export const MAX_SPOT_DIFFICULTY = 5;

/** Six decimal places is about 11 cm — finer than any phone or map click. */
const COORDINATE_SCALE = 1_000_000;
const toSixDecimals = (value: number): number =>
  Math.round(value * COORDINATE_SCALE) / COORDINATE_SCALE;

export const latitudeSchema = z
  .number({ error: 'Enter the latitude' })
  .min(-90, 'Latitude runs from -90 to 90')
  .max(90, 'Latitude runs from -90 to 90')
  .transform(toSixDecimals);

export const longitudeSchema = z
  .number({ error: 'Enter the longitude' })
  .min(-180, 'Longitude runs from -180 to 180')
  .max(180, 'Longitude runs from -180 to 180')
  .transform(toSixDecimals);

/** Optional free text: blank means not recorded, never an empty string stored. */
const optionalText = (max: number): z.ZodType<string | null, string | null> =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value === null || value === '' ? null : value));

/**
 * The writable fields, without defaults. Create and update both derive from
 * this, so a field added here reaches both.
 *
 * Defaults are added on create only: zod 4 applies a `.default()` even inside
 * `.partial()`, so a PATCH naming only `name` would otherwise reset terrain,
 * hazards and the rest to their defaults.
 */
const spotFields = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Give the spot a name')
    .max(80, 'Keep the name under 80 characters'),
  lat: latitudeSchema,
  lng: longitudeSchema,
  /** Nearest town or region, as the owner would say it. */
  locality: optionalText(120),
  terrain: z.enum(SpotTerrain).nullable(),
  access: z.enum(SpotAccess),
  difficulty: z
    .number()
    .int()
    .min(MIN_SPOT_DIFFICULTY, 'Difficulty runs from 1 to 5')
    .max(MAX_SPOT_DIFFICULTY, 'Difficulty runs from 1 to 5')
    .nullable(),
  hazards: z.array(z.enum(SpotHazard)).transform((list) => [...new Set(list)]),
  descriptionMd: optionalText(20_000),
  /** Parking, the way in, who to ask. */
  accessNotesMd: optionalText(5_000),
  visibility: z.enum(Visibility),
  /**
   * One flight video on YouTube, sent as the link someone pasted and stored as
   * the video it points at. Null removes it.
   */
  video: youTubeLinkSchema,
});

export const createSpotSchema = spotFields.extend({
  locality: spotFields.shape.locality.default(null),
  terrain: spotFields.shape.terrain.default(null),
  access: spotFields.shape.access.default(SpotAccess.Unknown),
  difficulty: spotFields.shape.difficulty.default(null),
  hazards: spotFields.shape.hazards.default([]),
  descriptionMd: spotFields.shape.descriptionMd.default(null),
  accessNotesMd: spotFields.shape.accessNotesMd.default(null),
  visibility: spotFields.shape.visibility.default(Visibility.Private),
  video: spotFields.shape.video.default(null),
});

/**
 * Every field optional, but an empty body is refused — an empty PATCH is a
 * client bug, not an intentional no-op.
 */
export const updateSpotSchema = spotFields
  .partial()
  .extend({
    /** A draft can be finished; a finished spot is never turned back into a draft. */
    isDraft: z.literal(false).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });

/** What a location captured from a GPS fix is called until someone names it. */
export const DRAFT_SPOT_NAME = 'Unnamed location';

/**
 * A one-tap capture at the field: the fix and nothing else. The server fills
 * in a placeholder name and saves it as a private draft.
 */
export const createDraftSpotSchema = z.object({
  lat: latitudeSchema,
  lng: longitudeSchema,
});

export const spotSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  lat: z.number(),
  lng: z.number(),
  locality: z.string().nullable(),
  terrain: z.enum(SpotTerrain).nullable(),
  access: z.enum(SpotAccess),
  difficulty: z.number().int().nullable(),
  hazards: z.array(z.enum(SpotHazard)),
  descriptionMd: z.string().nullable(),
  accessNotesMd: z.string().nullable(),
  visibility: z.enum(Visibility),
  /** Captured from a GPS fix and not filled in yet. */
  isDraft: z.boolean(),
  /** The spot's flight video on YouTube, if it has one. */
  video: youTubeVideoSchema.nullable(),
  /**
   * The video's thumbnail, fetched once by the server and served from our own
   * storage as a short-lived presigned URL — showing it never contacts
   * YouTube. Null for a spot without a video, and until the cover is made.
   */
  coverUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SpotFormValue = z.input<typeof createSpotSchema>;
export type CreateSpotDto = z.output<typeof createSpotSchema>;
export type CreateDraftSpotDto = z.output<typeof createDraftSpotSchema>;
export type UpdateSpotDto = z.output<typeof updateSpotSchema>;
export type SpotDto = z.output<typeof spotSchema>;

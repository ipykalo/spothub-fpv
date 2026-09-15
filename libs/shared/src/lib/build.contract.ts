import { z } from 'zod';

import { BuildClass, BuildStatus, Visibility } from './enums';

/**
 * The build contract, defined once.
 *
 * The API validates requests against these schemas; the client builds its forms
 * from the same types. One definition means the two cannot drift.
 */

/** Nullable date accepted from a form as `''`, an ISO date, or null. */
const optionalDate = z
  .union([z.iso.date(), z.literal(''), z.null()])
  .transform((value) => (value === '' || value === null ? null : value));

export const buildNameSchema = z
  .string()
  .trim()
  .min(1, 'Give the build a name')
  .max(80, 'Keep the name under 80 characters');

/**
 * The writable fields, without defaults. Both create and update derive from
 * this so they cannot diverge — a field added here is immediately available to
 * both.
 *
 * Defaults are added on create only: zod 4 applies a `.default()` even inside
 * `.partial()`, so a PATCH naming only `name` would otherwise reset the status
 * to PLANNING and clear the class, weight, notes and dates.
 */
const buildFields = z.object({
  name: buildNameSchema,
  buildClass: z.enum(BuildClass).nullable(),
  status: z.enum(BuildStatus),
  visibility: z.enum(Visibility),
  weightG: z.coerce
    .number()
    .int('Weight must be a whole number of grams')
    .positive('Weight must be positive')
    .max(50_000, 'That is not a quad')
    .nullable(),
  hasGps: z.boolean(),
  descriptionMd: z.string().max(20_000).nullable(),
  builtOn: optionalDate,
  retiredOn: optionalDate,
});

const newBuildFields = buildFields.extend({
  buildClass: buildFields.shape.buildClass.default(null),
  status: buildFields.shape.status.default(BuildStatus.Planning),
  visibility: buildFields.shape.visibility.default(Visibility.Private),
  weightG: buildFields.shape.weightG.default(null),
  hasGps: buildFields.shape.hasGps.default(false),
  descriptionMd: buildFields.shape.descriptionMd.default(null),
  builtOn: buildFields.shape.builtOn.default(null),
  retiredOn: buildFields.shape.retiredOn.default(null),
});

const retiredAfterBuilt = (value: {
  builtOn?: string | null;
  retiredOn?: string | null;
}): boolean => !(value.builtOn && value.retiredOn) || value.retiredOn >= value.builtOn;

const RETIRED_DATE_ISSUE = {
  message: 'Retired date cannot be before the build date',
  path: ['retiredOn'],
};

export const createBuildSchema = newBuildFields.refine(retiredAfterBuilt, RETIRED_DATE_ISSUE);

/**
 * Every field optional, but a body with no fields at all is rejected — an empty
 * PATCH is a client bug rather than an intentional no-op.
 */
export const updateBuildSchema = buildFields
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  })
  .refine(retiredAfterBuilt, RETIRED_DATE_ISSUE);

export const buildSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  buildClass: z.enum(BuildClass).nullable(),
  status: z.enum(BuildStatus),
  visibility: z.enum(Visibility),
  weightG: z.number().int().nullable(),
  hasGps: z.boolean(),
  descriptionMd: z.string().nullable(),
  /**
   * The chosen cover photo, and a short-lived presigned URL for it.
   *
   * The URL rides along on the list response so a page of build cards is one
   * request rather than one per card. It expires — treat it as something to
   * render now, never as an identifier to store.
   */
  coverAssetId: z.uuid().nullable(),
  coverUrl: z.string().nullable(),
  builtOn: z.string().nullable(),
  retiredOn: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const listBuildsQuerySchema = z.object({
  status: z.enum(BuildStatus).optional(),
  search: z.string().trim().min(1).max(80).optional(),
});

export type BuildFormValue = z.input<typeof newBuildFields>;
export type CreateBuildDto = z.output<typeof createBuildSchema>;
export type UpdateBuildDto = z.output<typeof updateBuildSchema>;
export type BuildDto = z.output<typeof buildSchema>;
export type ListBuildsQuery = z.output<typeof listBuildsQuerySchema>;

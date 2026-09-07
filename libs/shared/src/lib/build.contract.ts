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
 * The writable fields. Both create and update derive from this so they cannot
 * diverge — a field added here is immediately available to both.
 */
const buildFields = z.object({
  name: buildNameSchema,
  buildClass: z.enum(BuildClass).nullable().default(null),
  status: z.enum(BuildStatus).default(BuildStatus.Planning),
  visibility: z.enum(Visibility).default(Visibility.Private),
  weightG: z.coerce
    .number()
    .int('Weight must be a whole number of grams')
    .positive('Weight must be positive')
    .max(50_000, 'That is not a quad')
    .nullable()
    .default(null),
  hasGps: z.boolean().default(false),
  descriptionMd: z.string().max(20_000).nullable().default(null),
  builtOn: optionalDate.default(null),
  retiredOn: optionalDate.default(null),
});

const retiredAfterBuilt = (value: {
  builtOn?: string | null;
  retiredOn?: string | null;
}): boolean => !(value.builtOn && value.retiredOn) || value.retiredOn >= value.builtOn;

const RETIRED_DATE_ISSUE = {
  message: 'Retired date cannot be before the build date',
  path: ['retiredOn'],
};

export const createBuildSchema = buildFields.refine(
  retiredAfterBuilt,
  RETIRED_DATE_ISSUE,
);

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
  builtOn: z.string().nullable(),
  retiredOn: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const listBuildsQuerySchema = z.object({
  status: z.enum(BuildStatus).optional(),
  search: z.string().trim().min(1).max(80).optional(),
});

export type BuildFormValue = z.input<typeof buildFields>;
export type CreateBuildDto = z.output<typeof createBuildSchema>;
export type UpdateBuildDto = z.output<typeof updateBuildSchema>;
export type BuildDto = z.output<typeof buildSchema>;
export type ListBuildsQuery = z.output<typeof listBuildsQuerySchema>;

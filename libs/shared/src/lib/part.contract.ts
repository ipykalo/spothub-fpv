import { z } from 'zod';

import { PartCategory, PartStatus } from './enums';

/**
 * The parts contract, defined once.
 *
 * A part is a physical thing owned, not a field on a build — motors move
 * between quads, and spares exist before they are fitted to anything.
 */

/** Nullable date accepted from a form as `''`, an ISO date, or null. */
const optionalDate = z
  .union([z.iso.date(), z.literal(''), z.null()])
  .transform((value) => (value === '' || value === null ? null : value));

/**
 * Category-specific attributes, deliberately free-form.
 *
 * A motor carries kv and stator size; a VTX carries power levels. Rather than
 * a column per category, the shape is open — but values are constrained to
 * scalars so the JSONB column never grows nested structures nothing can query.
 */
export const partSpecSchema = z
  .record(
    z.string().min(1).max(40),
    z.union([z.string().max(200), z.number(), z.boolean()]),
  )
  .default({});

export const partFields = z.object({
  category: z.enum(PartCategory),
  manufacturer: z
    .union([z.string().trim().max(80), z.null()])
    .transform((value) => (value === null || value === '' ? null : value))
    .default(null),
  model: z
    .union([z.string().trim().max(120), z.null()])
    .transform((value) => (value === null || value === '' ? null : value))
    .default(null),
  spec: partSpecSchema,
  quantityOwned: z.coerce
    .number()
    .int('Quantity must be a whole number')
    .min(0, 'Quantity cannot be negative')
    .max(9_999)
    .default(1),
  status: z.enum(PartStatus).default(PartStatus.Serviceable),
  notesMd: z
    .union([z.string().max(20_000), z.null()])
    .transform((value) => (value === null || value === '' ? null : value))
    .default(null),
});

export const createPartSchema = partFields;

/**
 * Every field optional, but a body with no fields at all is rejected — an empty
 * PATCH is a client bug rather than an intentional no-op.
 */
export const updatePartSchema = partFields
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });

/** A price capture or a purchase. Several rows per part are expected. */
export const partSourceFields = z.object({
  vendor: z
    .union([z.string().trim().max(80), z.null()])
    .transform((value) => (value === null || value === '' ? null : value))
    .default(null),
  url: z
    .union([z.url('That does not look like a link'), z.literal(''), z.null()])
    .transform((value) => (value === null || value === '' ? null : value))
    .default(null),
  // Order matters: `z.coerce.number()` accepts null and '' and turns both into
  // 0, so it must come last or an unfilled price is stored as a real zero.
  price: z
    .union([
      z.null(),
      z.literal('').transform(() => null),
      z.coerce.number().nonnegative('Price cannot be negative').max(1_000_000),
    ])
    .default(null),
  currency: z
    .union([z.string().trim().length(3, 'Use a three-letter code, e.g. EUR'), z.null()])
    .transform((value) => (value === null || value === '' ? null : value.toUpperCase()))
    .default(null),
  isPurchase: z.boolean().default(false),
  purchasedOn: optionalDate.default(null),
  quantity: z.coerce.number().int().min(1).max(9_999).default(1),
});

export const createPartSourceSchema = partSourceFields.refine(
  (value) => !value.isPurchase || value.price !== null,
  { message: 'A purchase needs a price', path: ['price'] },
);

/**
 * Every field optional, but a body with no fields at all is rejected. Used to
 * correct a purchase already recorded rather than stacking a second row.
 */
export const updatePartSourceSchema = partSourceFields
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });

/** The wire shape of a source row. */
export const partSourceSchema = z.object({
  id: z.uuid(),
  partId: z.uuid(),
  vendor: z.string().nullable(),
  url: z.string().nullable(),
  price: z.number().nullable(),
  currency: z.string().nullable(),
  isPurchase: z.boolean(),
  purchasedOn: z.string().nullable(),
  quantity: z.number().int(),
  capturedAt: z.string(),
});

export const partSchema = z.object({
  id: z.uuid(),
  category: z.enum(PartCategory),
  manufacturer: z.string().nullable(),
  model: z.string().nullable(),
  spec: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  quantityOwned: z.number().int(),
  status: z.enum(PartStatus),
  notesMd: z.string().nullable(),
  sources: z.array(partSourceSchema),
  /**
   * How many units of this row are fitted to a build right now, across every
   * build. Derived from `build_parts`, never stored: whether something is
   * installed is a fact the database already holds, and a second copy of it
   * would drift the first time a dropdown was not updated.
   */
  fittedCount: z.number().int(),
  /** Unit price of the row flagged `isPurchase`, or null if never bought. */
  purchasePrice: z.number().nullable(),
  purchaseCurrency: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const listPartsQuerySchema = z.object({
  category: z.enum(PartCategory).optional(),
  status: z.enum(PartStatus).optional(),
  search: z.string().trim().min(1).max(80).optional(),
});

/** Paste-a-URL enrichment: the API fetches the page and reads its OpenGraph tags. */
export const enrichUrlSchema = z.object({
  url: z.url('Paste a full link, including https://'),
});

export const urlPreviewSchema = z.object({
  title: z.string().nullable(),
  imageUrl: z.string().nullable(),
  price: z.number().nullable(),
  currency: z.string().nullable(),
  vendor: z.string().nullable(),
});

export type PartSpec = z.output<typeof partSpecSchema>;
export type PartFormValue = z.input<typeof partFields>;
export type CreatePartDto = z.output<typeof createPartSchema>;
export type UpdatePartDto = z.output<typeof updatePartSchema>;
export type PartDto = z.output<typeof partSchema>;
export type PartSourceDto = z.output<typeof partSourceSchema>;
export type CreatePartSourceDto = z.output<typeof createPartSourceSchema>;
export type UpdatePartSourceDto = z.output<typeof updatePartSourceSchema>;
export type ListPartsQuery = z.output<typeof listPartsQuerySchema>;
export type EnrichUrlDto = z.output<typeof enrichUrlSchema>;
export type UrlPreviewDto = z.output<typeof urlPreviewSchema>;

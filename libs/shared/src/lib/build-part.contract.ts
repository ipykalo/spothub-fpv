import { z } from 'zod';

import { InstallReason } from './enums';
import { partFields, partSchema, partUnitSchema } from './part.contract';

/**
 * Fitting a part to a build, over time.
 *
 * An install is not a link between two rows — it is a period. `removedOn`
 * being null is what "currently fitted" means, which is why a motor can move
 * between quads and keep its whole history.
 */

const isoDate = z.iso.date();

export const installPartSchema = z.object({
  /** A specific physical unit, not a kind: you fit one motor, not "a motor". */
  unitId: z.uuid('Pick a part to install'),
  /** Where on the airframe: "motor FR", "arm RL". */
  position: z
    .union([z.string().trim().max(40), z.null()])
    .transform((value) => (value === null || value === '' ? null : value))
    .default(null),
  installedOn: isoDate,
  reason: z.enum(InstallReason).default(InstallReason.Initial),
  /** Set when fitting something as part of a repair. */
  repairId: z.uuid().nullable().default(null),
});

/** One line of a ready-made quad's spec sheet: a kind of part, and how many it came with. */
export const stockPartSchema = z.object({
  category: partFields.shape.category,
  manufacturer: partFields.shape.manufacturer.default(null),
  model: partFields.shape.model.default(null),
  count: z.coerce
    .number()
    .int('Count must be a whole number')
    .min(1, 'At least one')
    .max(8, 'At most eight of one kind')
    .default(1),
});

/**
 * The parts a quad came with, entered in one go: each line becomes a part in
 * the inventory with `count` units, every unit fitted as INITIAL — which on a
 * quad bought complete means covered by its price. No prices here, on purpose.
 */
export const addStockPartsSchema = z.object({
  installedOn: isoDate,
  parts: z
    .array(stockPartSchema)
    .min(1, 'Add at least one part')
    .max(30, 'Add at most 30 lines at a time'),
});

/** Removing is recording an end date, never deleting the row. */
export const removeInstallSchema = z.object({
  removedOn: isoDate,
});

export const buildPartSchema = z.object({
  id: z.uuid(),
  buildId: z.uuid(),
  unitId: z.uuid(),
  position: z.string().nullable(),
  installedOn: z.string(),
  removedOn: z.string().nullable(),
  reason: z.enum(InstallReason),
  /** The repair this fitting was part of, when it replaced something. */
  repairId: z.uuid().nullable(),
  unit: partUnitSchema,
  part: partSchema,
});

/**
 * Cost is reported per currency, never as one number.
 *
 * Parts get bought in whatever the shop charges in — UAH here, EUR there — and
 * silently adding those together would produce a figure that looks precise and
 * means nothing. Converting would need a rate at purchase date, which is a
 * bigger feature than this ticket.
 */
export const buildCostSchema = z.object({
  /**
   * What the quad cost: on a bought one, its price plus every part fitted
   * since; on a built one, the fitted parts.
   */
  totals: z.array(
    z.object({
      currency: z.string(),
      amount: z.number(),
    }),
  ),
  /** A bought quad's own price, already inside `totals`. Null on a built one. */
  boughtFor: z
    .object({
      currency: z.string(),
      amount: z.number(),
    })
    .nullable(),
  /**
   * Fitted parts the quad came with, covered by `boughtFor` and never counted
   * on their own — even when they carry a price, which would count it twice.
   */
  stockCount: z.number().int(),
  /** Fitted parts with no purchase price recorded, so the total is a floor. */
  unpricedCount: z.number().int(),
  installedCount: z.number().int(),
  /**
   * Money spent on repairs, separate from what the fitted parts cost.
   *
   * Two different questions — "what is bolted to this quad" and "what has this
   * quad cost me in crashes" — and adding them would answer neither.
   */
  repairTotals: z.array(
    z.object({
      currency: z.string(),
      amount: z.number(),
    }),
  ),
  repairCount: z.number().int(),
});

export const listBuildPartsQuerySchema = z.object({
  /** `true` limits to what is fitted right now; omit for the full history. */
  installed: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((value) => value === true || value === 'true')
    .optional(),
});

export type InstallPartDto = z.output<typeof installPartSchema>;
export type RemoveInstallDto = z.output<typeof removeInstallSchema>;
export type StockPartValue = z.input<typeof stockPartSchema>;
export type AddStockPartsDto = z.output<typeof addStockPartsSchema>;
export type BuildPartDto = z.output<typeof buildPartSchema>;
export type BuildCostDto = z.output<typeof buildCostSchema>;
export type ListBuildPartsQuery = z.output<typeof listBuildPartsQuerySchema>;

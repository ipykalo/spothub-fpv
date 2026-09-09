import { z } from 'zod';

import { InstallReason } from './enums';
import { partSchema, partUnitSchema } from './part.contract';

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
  totals: z.array(
    z.object({
      currency: z.string(),
      amount: z.number(),
    }),
  ),
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
export type BuildPartDto = z.output<typeof buildPartSchema>;
export type BuildCostDto = z.output<typeof buildCostSchema>;
export type ListBuildPartsQuery = z.output<typeof listBuildPartsQuerySchema>;

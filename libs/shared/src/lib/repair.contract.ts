import { z } from 'zod';

import { RepairCause } from './enums';

/**
 * A repair: something that went wrong, and what putting it right cost.
 *
 * One event, not one part. A hard crash takes an arm, two props and sometimes
 * a motor, and the money is spent on the event — so the installs made during
 * it point back here rather than each carrying their own story.
 */

const isoDate = z.iso.date();

export const repairFields = z.object({
  occurredOn: isoDate,
  cause: z.enum(RepairCause).default(RepairCause.Crash),
  descriptionMd: z
    .union([z.string().max(20_000), z.null()])
    .transform((value) => (value === null || value === '' ? null : value))
    .default(null),
  /**
   * What the repair cost beyond the parts themselves — a shop bill, or a
   * replacement bought without being catalogued. Ordered so `z.coerce` cannot
   * turn an unfilled field into a real zero.
   */
  cost: z
    .union([
      z.null(),
      z.literal('').transform(() => null),
      z.coerce.number().nonnegative('Cost cannot be negative').max(1_000_000),
    ])
    .default(null),
  currency: z
    .union([z.string().trim().length(3, 'Use a three-letter code, e.g. EUR'), z.null()])
    .transform((value) => (value === null || value === '' ? null : value.toUpperCase()))
    .default(null),
});

export const createRepairSchema = repairFields.refine(
  (value) => value.cost === null || value.currency !== null,
  { message: 'A cost needs a currency', path: ['currency'] },
);

export const updateRepairSchema = repairFields
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });

export const repairSchema = z.object({
  id: z.uuid(),
  buildId: z.uuid(),
  occurredOn: z.string(),
  cause: z.enum(RepairCause),
  descriptionMd: z.string().nullable(),
  cost: z.number().nullable(),
  currency: z.string().nullable(),
  /** How many parts were fitted as part of this repair. */
  installCount: z.number().int(),
  createdAt: z.string(),
});

/** Links an existing install to a repair, or clears the link with null. */
export const linkInstallSchema = z.object({
  repairId: z.uuid().nullable(),
});

export type CreateRepairDto = z.output<typeof createRepairSchema>;
export type UpdateRepairDto = z.output<typeof updateRepairSchema>;
export type RepairDto = z.output<typeof repairSchema>;
export type LinkInstallDto = z.output<typeof linkInstallSchema>;

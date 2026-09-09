import { z } from 'zod';

import { ConfigKind } from './enums';

/**
 * A Betaflight CLI capture attached to a build.
 *
 * The raw text is the record and is stored verbatim; the parsed fields are
 * derived from it by `parseBetaflightConfig` so the app can answer "what
 * firmware is this quad on" without re-parsing on every read.
 */

/** Long enough to be a real capture, short enough to reject a stray paste. */
export const createConfigSchema = z.object({
  raw: z
    .string()
    .trim()
    .min(20, 'That does not look like a CLI dump')
    .max(500_000, 'That is larger than any Betaflight config'),
  note: z
    .union([z.string().max(2_000), z.null()])
    .transform((value) => (value === null || value === '' ? null : value))
    .default(null),
});

export const updateConfigSchema = z.object({
  note: z
    .union([z.string().max(2_000), z.null()])
    .transform((value) => (value === null || value === '' ? null : value)),
});

export const configSchema = z.object({
  id: z.uuid(),
  buildId: z.uuid(),
  capturedAt: z.string(),
  kind: z.enum(ConfigKind),
  note: z.string().nullable(),

  fwTarget: z.string().nullable(),
  fwVersion: z.string().nullable(),
  fwBuildDate: z.string().nullable(),
  fwGitRev: z.string().nullable(),
  mspApi: z.string().nullable(),
  configRev: z.string().nullable(),

  boardName: z.string().nullable(),
  manufacturerId: z.string().nullable(),
  mcuId: z.string().nullable(),
  craftName: z.string().nullable(),
});

/**
 * The full capture including its text.
 *
 * Separate from `configSchema` because a list of ten captures should not ship
 * ten CLI dumps; the raw text is fetched one at a time, and by the diff
 * viewer two at a time.
 */
export const configWithRawSchema = configSchema.extend({
  raw: z.string(),
});

export type CreateConfigDto = z.output<typeof createConfigSchema>;
export type UpdateConfigDto = z.output<typeof updateConfigSchema>;
export type ConfigDto = z.output<typeof configSchema>;
export type ConfigWithRawDto = z.output<typeof configWithRawSchema>;

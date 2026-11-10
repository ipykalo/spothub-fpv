import { z } from 'zod';

/**
 * The settings an admin changes from the Admin page. Secrets are not among
 * them and never will be: those stay in the environment.
 */

/** One address on the allowlist, stored lower-cased so a match ignores case. */
export const allowedEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('That does not look like an email address'));

const GIB = 1024 ** 3;

/** A storage limit: at least 100 MiB, at most 1 TiB, in whole bytes. */
export const storageQuotaSchema = z
  .number()
  .int()
  .min(100 * 1024 ** 2, 'Allow at least 100 MB')
  .max(1024 * GIB, 'Allow at most 1 TB');

export const appSettingsSchema = z.object({
  /** Anyone with a Google account may sign in. */
  openRegistration: z.boolean(),
  /** Who may sign in while registration is closed. */
  allowedEmails: z.array(z.string()),
  /** What each pilot may keep in storage unless given their own limit. */
  defaultStorageQuotaBytes: z.number(),
  updatedAt: z.string(),
});

/**
 * Either setting, or both. No defaults, so a PATCH of one leaves the other
 * alone. The list is replaced whole — it is short, and the page holds all of
 * it — with duplicates dropped.
 */
export const updateAppSettingsSchema = z
  .object({
    openRegistration: z.boolean(),
    allowedEmails: z
      .array(allowedEmailSchema)
      .max(500, 'Keep the list under 500 addresses')
      .transform((emails) => [...new Set(emails)]),
    defaultStorageQuotaBytes: storageQuotaSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one setting to change',
  });

export type AppSettingsDto = z.output<typeof appSettingsSchema>;
export type UpdateAppSettingsDto = z.output<typeof updateAppSettingsSchema>;

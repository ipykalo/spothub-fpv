import { z } from 'zod';

import { Role, UserStatus } from './enums';
import { storageQuotaSchema } from './settings.contract';

/** The authenticated user as the client sees it. Never includes tokens. */
export const currentUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  /** The full name from Google: shown to the pilot themselves and to an admin, nobody else. */
  displayName: z.string().nullable(),
  /** The name they chose, or null to go by `publicName`'s short form. */
  pilotName: z.string().nullable(),
  /** What every other pilot and visitor sees (`publicName()`). */
  publicName: z.string().nullable(),
  /** The currency their totals are shown in, besides USD; new prices start in it. */
  homeCurrency: z.string(),
  avatarUrl: z.url().nullable(),
  role: z.enum(Role),
  /** Read-only accounts see a banner saying so; the API refuses their writes. */
  status: z.enum(UserStatus),
});

export type CurrentUserDto = z.output<typeof currentUserSchema>;

/** Returned by the refresh endpoint. The refresh token itself stays in an
 *  httpOnly cookie and is never exposed to JavaScript. */
export const accessTokenSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int().positive(),
});

export type AccessTokenDto = z.output<typeof accessTokenSchema>;

/** A pilot as the Admin page lists them. */
export const adminUserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string().nullable(),
  /** The name they go by on the site, when they chose one. */
  pilotName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  role: z.enum(Role),
  status: z.enum(UserStatus),
  /** Whether this row is the admin looking at the list, whose own status cannot be changed. */
  isViewer: z.boolean(),
  createdAt: z.string(),
  lastSignInAt: z.string().nullable(),
  /** Photos, post images and flight logs, as stored. */
  storageUsedBytes: z.number(),
  /** What this pilot may keep: their own limit, else the default. */
  storageLimitBytes: z.number(),
  /** Their own limit, when an admin set one; null follows the default. */
  storageQuotaBytes: z.number().nullable(),
});

/**
 * What an admin may change about a pilot: either, or both. A null limit puts
 * them back on the default.
 */
export const updateAdminUserSchema = z
  .object({
    status: z.enum(UserStatus),
    storageQuotaBytes: storageQuotaSchema.nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one change',
  });

/** How much of their storage a pilot has used. */
export const storageUsageSchema = z.object({
  usedBytes: z.number(),
  limitBytes: z.number(),
});

export type StorageUsageDto = z.output<typeof storageUsageSchema>;

export type AdminUserDto = z.output<typeof adminUserSchema>;
export type UpdateAdminUserDto = z.output<typeof updateAdminUserSchema>;

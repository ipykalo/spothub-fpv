import { z } from 'zod';

import { Role, UserStatus } from './enums';

/** The authenticated user as the client sees it. Never includes tokens. */
export const currentUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string().nullable(),
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
  avatarUrl: z.string().nullable(),
  role: z.enum(Role),
  status: z.enum(UserStatus),
  /** Whether this row is the admin looking at the list, whose own status cannot be changed. */
  isViewer: z.boolean(),
  createdAt: z.string(),
  lastSignInAt: z.string().nullable(),
});

/** What an admin may change about a pilot. */
export const updateAdminUserSchema = z.object({
  status: z.enum(UserStatus),
});

export type AdminUserDto = z.output<typeof adminUserSchema>;
export type UpdateAdminUserDto = z.output<typeof updateAdminUserSchema>;

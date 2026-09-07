import { z } from 'zod';

import { Role } from './enums';

/** The authenticated user as the client sees it. Never includes tokens. */
export const currentUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string().nullable(),
  avatarUrl: z.url().nullable(),
  role: z.enum(Role),
});

export type CurrentUserDto = z.output<typeof currentUserSchema>;

/** Returned by the refresh endpoint. The refresh token itself stays in an
 *  httpOnly cookie and is never exposed to JavaScript. */
export const accessTokenSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int().positive(),
});

export type AccessTokenDto = z.output<typeof accessTokenSchema>;

import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';

import { TokenService } from '../../src/auth/services/token.service';
import { PrismaService } from '../../src/prisma';
import { AuthProviderKind, UsersFacade } from '../../src/users';

export interface TestUser {
  readonly id: string;
  readonly email: string;
  readonly accessToken: string;
}

/**
 * A real user, made the way a Google sign-in makes one — through
 * `UsersFacade.upsertFromIdentity` — with a real access token from
 * `TokenService`, the same class `AuthService` uses on the callback route.
 *
 * `ALLOWED_EMAILS` never comes into it: that gate sits in `AuthService`, on
 * the OAuth callback this bypasses, not in `upsertFromIdentity` itself.
 */
export async function createTestUser(
  app: INestApplication,
  label: string,
): Promise<TestUser> {
  const users = app.get(UsersFacade);
  const tokens = app.get(TokenService);
  const email = `e2e-${label}-${randomUUID()}@example.invalid`;

  const user = await users.upsertFromIdentity({
    provider: AuthProviderKind.Google,
    subject: randomUUID(),
    email,
    displayName: null,
    avatarUrl: null,
  });

  const issued = await tokens.issueForLogin(user);

  return { id: user.id, email, accessToken: issued.accessToken };
}

/**
 * Deletes a test user by exact id. Every owned row — builds, parts, flights,
 * sessions, log files and imports — cascades from the user, so this is the
 * whole cleanup for anything a test created under it.
 */
export async function deleteTestUser(app: INestApplication, id: string): Promise<void> {
  const prisma = app.get(PrismaService);
  await prisma.user.delete({ where: { id } });
}

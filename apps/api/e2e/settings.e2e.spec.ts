import { randomUUID } from 'node:crypto';

import { ForbiddenException } from '@nestjs/common';
import type { AppSettingsDto } from '@spothub/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthService } from '../src/auth/services/auth.service';
import { PrismaService } from '../src/prisma';
import { type TestApp, createTestApp } from './support/app';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

/**
 * The Admin page's settings: only an admin reads or changes them, and the
 * sign-in gate follows what is stored the moment it changes, with no restart.
 * The tests run in order and put the settings back as they found them.
 */
describe('app settings', () => {
  let testApp: TestApp;
  let admin: TestUser;
  let pilot: TestUser;
  let before: AppSettingsDto;
  const signedUp: string[] = [];

  beforeAll(async () => {
    testApp = await createTestApp();
    admin = await createTestUser(testApp.app, 'settings-admin');
    pilot = await createTestUser(testApp.app, 'settings-pilot');

    // Promotion is a deliberate database write; there is no route for it.
    await testApp.app
      .get(PrismaService)
      .user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });

    before = await read(admin);
  });

  afterAll(async () => {
    await patch(admin, {
      openRegistration: before.openRegistration,
      allowedEmails: before.allowedEmails,
    }).expect(200);

    const prisma = testApp.app.get(PrismaService);
    await prisma.user.deleteMany({ where: { email: { in: signedUp } } });
    await deleteTestUser(testApp.app, admin.id);
    await deleteTestUser(testApp.app, pilot.id);
    await testApp.close();
  });

  const as = (user: TestUser): string => `Bearer ${user.accessToken}`;

  async function read(user: TestUser): Promise<AppSettingsDto> {
    const response = await request(testApp.server)
      .get('/api/admin/settings')
      .set('Authorization', as(user))
      .expect(200);
    return response.body as AppSettingsDto;
  }

  const patch = (user: TestUser, body: object): request.Test =>
    request(testApp.server)
      .patch('/api/admin/settings')
      .set('Authorization', as(user))
      .send(body);

  /** A real Google sign-in as far as the API goes: the callback's own service. */
  async function signIn(email: string): Promise<boolean> {
    try {
      await testApp.app.get(AuthService).signInWithGoogle({
        subject: randomUUID(),
        email,
        displayName: null,
        avatarUrl: null,
      });
      signedUp.push(email);
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        return false;
      }
      throw error;
    }
  }

  it('is the admin’s alone: a pilot is refused, a visitor must sign in', async () => {
    await request(testApp.server)
      .get('/api/admin/settings')
      .set('Authorization', as(pilot))
      .expect(403);
    await patch(pilot, { openRegistration: true }).expect(403);
    await request(testApp.server).get('/api/admin/settings').expect(401);
  });

  it('keeps the list lower-cased and without repeats, and refuses what is not an address', async () => {
    const saved = (
      await patch(admin, {
        openRegistration: false,
        allowedEmails: [
          'Friend@Example.com',
          'friend@example.com',
          ' other@example.com ',
        ],
      }).expect(200)
    ).body as AppSettingsDto;

    expect(saved.allowedEmails).toEqual(['friend@example.com', 'other@example.com']);

    await patch(admin, { allowedEmails: ['not an email'] }).expect(400);
    await patch(admin, {}).expect(400);
  });

  it('changing one setting leaves the other alone', async () => {
    const saved = (await patch(admin, { openRegistration: true }).expect(200))
      .body as AppSettingsDto;

    expect(saved.openRegistration).toBe(true);
    expect(saved.allowedEmails).toEqual(['friend@example.com', 'other@example.com']);
  });

  it('lets anyone sign in while sign-up is open, and only the list once it is closed', async () => {
    const stranger = `e2e-stranger-${randomUUID()}@example.invalid`;
    const friend = `e2e-friend-${randomUUID()}@example.invalid`;

    expect(await signIn(stranger)).toBe(true);

    await patch(admin, { openRegistration: false, allowedEmails: [friend] }).expect(200);

    expect(await signIn(`e2e-stranger-${randomUUID()}@example.invalid`)).toBe(false);
    expect(await signIn(friend.toUpperCase())).toBe(true);
  });
});

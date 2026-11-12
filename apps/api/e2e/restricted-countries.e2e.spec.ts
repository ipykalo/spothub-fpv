import { randomUUID } from 'node:crypto';

import type { AdminUserDto, AppSettingsDto } from '@spothub/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { GoogleProfile } from '../src/auth/auth.types';
import { RestrictedCountryError } from '../src/auth/restricted-country.error';
import { AuthService } from '../src/auth/services/auth.service';
import { PrismaService } from '../src/prisma';
import { type TestApp, createTestApp } from './support/app';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

const RUSSIA = '198.51.100.7';
const UKRAINE = '198.51.100.8';
const IRAN = '198.51.100.9';
const NOWHERE = '127.0.0.1';

/**
 * Nobody signs in from a restricted country — a new pilot or one already
 * registered — except an admin. Where each sign-in came from is kept for the
 * Admin page, refused or not.
 */
describe('restricted countries', () => {
  let testApp: TestApp;
  let admin: TestUser;
  let before: AppSettingsDto;
  const emails: string[] = [];

  const auth = (): AuthService => testApp.app.get(AuthService);
  const prisma = (): PrismaService => testApp.app.get(PrismaService);

  const profile = (label: string, subject = randomUUID()): GoogleProfile => {
    const email = `e2e-country-${label}-${randomUUID()}@example.invalid`;
    emails.push(email);
    return { subject, email, emailVerified: true, displayName: null, avatarUrl: null };
  };

  const settings = (body: object): request.Test =>
    request(testApp.server)
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send(body);

  beforeAll(async () => {
    testApp = await createTestApp();
    admin = await createTestUser(testApp.app, 'country-admin');
    await prisma().user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });

    before = (
      await request(testApp.server)
        .get('/api/admin/settings')
        .set('Authorization', `Bearer ${admin.accessToken}`)
    ).body as AppSettingsDto;

    // Open, so only the country decides; Russia and Iran on the list.
    await settings({
      openRegistration: true,
      blockedCountries: ['RU', 'IR', 'KP'],
    }).expect(200);
  });

  afterAll(async () => {
    await settings({
      openRegistration: before.openRegistration,
      blockedCountries: before.blockedCountries,
    });
    await prisma().user.deleteMany({ where: { email: { in: emails } } });
    await deleteTestUser(testApp.app, admin.id);
    await testApp.close();
  });

  it('refuses a new pilot from a restricted country, and makes no account', async () => {
    const newcomer = profile('newcomer');

    await expect(auth().signInWithGoogle(newcomer, RUSSIA)).rejects.toBeInstanceOf(
      RestrictedCountryError,
    );
    await expect(auth().signInWithGoogle(newcomer, IRAN)).rejects.toBeInstanceOf(
      RestrictedCountryError,
    );
    expect(await prisma().user.count({ where: { email: newcomer.email } })).toBe(0);
  });

  it('lets anyone else in, noting where from, and refuses them later from a restricted country', async () => {
    const pilot = profile('pilot');

    await auth().signInWithGoogle(pilot, UKRAINE);
    const row = await prisma().user.findUniqueOrThrow({ where: { email: pilot.email } });
    expect(row.lastSignInCountry).toBe('UA');

    await expect(auth().signInWithGoogle(pilot, RUSSIA)).rejects.toBeInstanceOf(
      RestrictedCountryError,
    );

    // The refused attempt is what the Admin page shows.
    const pilots = (
      await request(testApp.server)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${admin.accessToken}`)
    ).body as AdminUserDto[];
    expect(pilots.find((user) => user.id === row.id)?.lastSignInCountry).toBe('RU');
  });

  it('never refuses an admin, wherever they are', async () => {
    const adminRow = await prisma().user.findUniqueOrThrow({ where: { id: admin.id } });
    const identity = await prisma().authIdentity.findFirstOrThrow({
      where: { userId: admin.id },
    });

    await expect(
      auth().signInWithGoogle(
        {
          subject: identity.subject,
          email: adminRow.email,
          emailVerified: true,
          displayName: null,
          avatarUrl: null,
        },
        RUSSIA,
      ),
    ).resolves.toBeDefined();
  });

  it('refuses nobody for an address it cannot place', async () => {
    await expect(
      auth().signInWithGoogle(profile('unplaced'), NOWHERE),
    ).resolves.toBeDefined();
    await expect(auth().signInWithGoogle(profile('no-address'))).resolves.toBeDefined();
  });

  it('follows the Admin page: off the list, in', async () => {
    await settings({ blockedCountries: ['IR', 'KP'] }).expect(200);
    await expect(
      auth().signInWithGoogle(profile('allowed-again'), RUSSIA),
    ).resolves.toBeDefined();

    const refused = await settings({ blockedCountries: ['XX'] });
    expect(refused.status).toBe(400);
  });
});

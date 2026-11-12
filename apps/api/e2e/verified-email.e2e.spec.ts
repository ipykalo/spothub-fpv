import { randomUUID } from 'node:crypto';

import type { AppSettingsDto } from '@spothub/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { GoogleProfile } from '../src/auth/auth.types';
import { AuthService } from '../src/auth/services/auth.service';
import { UnverifiedEmailError } from '../src/auth/unverified-email.error';
import { PrismaService } from '../src/prisma';
import { type TestApp, createTestApp } from './support/app';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

/**
 * An email Google has not verified is only a claim, and two things trust the
 * address: the allowlist, and linking a new Google identity to the account
 * that already has it. So an unverified one is refused before either looks.
 */
describe('verified email', () => {
  let testApp: TestApp;
  let admin: TestUser;
  let pilot: TestUser;
  let before: AppSettingsDto;
  const emails: string[] = [];

  const auth = (): AuthService => testApp.app.get(AuthService);
  const prisma = (): PrismaService => testApp.app.get(PrismaService);

  const profile = (email: string, emailVerified: boolean): GoogleProfile => ({
    subject: randomUUID(),
    email,
    emailVerified,
    displayName: null,
    avatarUrl: null,
  });

  const settings = (body: object): request.Test =>
    request(testApp.server)
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send(body);

  beforeAll(async () => {
    testApp = await createTestApp();
    admin = await createTestUser(testApp.app, 'verified-admin');
    pilot = await createTestUser(testApp.app, 'verified-pilot');
    await prisma().user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });

    before = (
      await request(testApp.server)
        .get('/api/admin/settings')
        .set('Authorization', `Bearer ${admin.accessToken}`)
    ).body as AppSettingsDto;
  });

  afterAll(async () => {
    await settings({
      openRegistration: before.openRegistration,
      allowedEmails: before.allowedEmails,
    });
    await prisma().user.deleteMany({ where: { email: { in: emails } } });
    await deleteTestUser(testApp.app, pilot.id);
    await deleteTestUser(testApp.app, admin.id);
    await testApp.close();
  });

  it('refuses an allowlisted address Google has not verified, and makes no account', async () => {
    const email = `e2e-verified-${randomUUID()}@example.invalid`;
    emails.push(email);
    await settings({ openRegistration: false, allowedEmails: [email] }).expect(200);

    await expect(auth().signInWithGoogle(profile(email, false))).rejects.toBeInstanceOf(
      UnverifiedEmailError,
    );
    expect(await prisma().user.count({ where: { email } })).toBe(0);

    // The same address, verified, is let in.
    await expect(auth().signInWithGoogle(profile(email, true))).resolves.toBeDefined();
    expect(await prisma().user.count({ where: { email } })).toBe(1);
  });

  it('never links an unverified identity to the account that has its address', async () => {
    await settings({ openRegistration: true }).expect(200);
    const intruder = profile(pilot.email, false);

    await expect(auth().signInWithGoogle(intruder)).rejects.toBeInstanceOf(
      UnverifiedEmailError,
    );

    const identities = await prisma().authIdentity.findMany({
      where: { userId: pilot.id },
    });
    expect(identities.map((identity) => identity.subject)).not.toContain(
      intruder.subject,
    );
    expect(identities).toHaveLength(1);
  });
});

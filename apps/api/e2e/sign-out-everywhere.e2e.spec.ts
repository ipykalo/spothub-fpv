import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TokenService } from '../src/auth/services/token.service';
import { UsersFacade } from '../src/users';
import { type TestApp, createTestApp } from './support/app';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

/**
 * Signing out on every device ends every session the pilot has, not just the
 * one asking: a phone left signed in is refused at its next refresh.
 */
describe('sign out on all devices', () => {
  let testApp: TestApp;
  let pilot: TestUser;
  let other: TestUser;

  beforeAll(async () => {
    testApp = await createTestApp();
    pilot = await createTestUser(testApp.app, 'everywhere-pilot');
    other = await createTestUser(testApp.app, 'everywhere-other');
  });

  afterAll(async () => {
    await deleteTestUser(testApp.app, pilot.id);
    await deleteTestUser(testApp.app, other.id);
    await testApp.close();
  });

  /** A Google sign-in on one more device: its own session, its own cookie. */
  async function signInOnAnotherDevice(user: TestUser): Promise<string> {
    const entity = await testApp.app.get(UsersFacade).findById(user.id);
    if (!entity) {
      throw new Error('the test pilot is missing');
    }
    return (await testApp.app.get(TokenService).issueForLogin(entity)).refreshToken;
  }

  const refresh = (cookie: string): request.Test =>
    request(testApp.server)
      .post('/api/auth/refresh')
      .set('Cookie', `spothub_rt=${cookie}`);

  it('refuses every other device its next refresh, and clears this one', async () => {
    const laptop = await signInOnAnotherDevice(pilot);
    const phone = await signInOnAnotherDevice(pilot);
    const someoneElse = await signInOnAnotherDevice(other);

    const response = await request(testApp.server)
      .post('/api/auth/logout-all')
      .set('Authorization', `Bearer ${pilot.accessToken}`)
      .set('Cookie', `spothub_rt=${laptop}`)
      .expect(204);

    // This device's cookie is told to go.
    const cleared = ([] as string[])
      .concat(response.headers['set-cookie'] ?? [])
      .find((cookie) => cookie.startsWith('spothub_rt='));
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);

    await refresh(laptop).expect(401);
    await refresh(phone).expect(401);

    // Only this pilot's sessions: another pilot is left signed in.
    await refresh(someoneElse).expect(200);
  });

  it('needs the pilot signed in: a visitor cannot sign anyone out', async () => {
    await request(testApp.server).post('/api/auth/logout-all').expect(401);
  });
});

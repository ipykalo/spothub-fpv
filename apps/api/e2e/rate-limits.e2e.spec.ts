import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type TestApp, createTestApp } from './support/app';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

/**
 * Every route is limited per caller: a signed-in pilot as themselves, a
 * visitor by address. A refusal is a 429 with words the client shows as they
 * are, and a Retry-After saying when to come back.
 */
describe('rate limits', () => {
  let testApp: TestApp;
  let pilot: TestUser;
  let other: TestUser;

  beforeAll(async () => {
    testApp = await createTestApp();
    pilot = await createTestUser(testApp.app, 'limits-pilot');
    other = await createTestUser(testApp.app, 'limits-other');
  });

  afterAll(async () => {
    await deleteTestUser(testApp.app, pilot.id);
    await deleteTestUser(testApp.app, other.id);
    await testApp.close();
  });

  // An empty body fails validation, so nothing is fetched — but the guard
  // runs before the pipe, and every attempt counts.
  const preview = (user: TestUser): request.Test =>
    request(testApp.server)
      .post('/api/parts/url-preview')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({});

  it('refuses a pilot past a route’s limit, and only that pilot', async () => {
    for (let i = 0; i < 20; i += 1) {
      await preview(pilot).expect(400);
    }

    const refused = await preview(pilot).expect(429);
    expect((refused.body as { message: string }).message).toBe(
      'Too many requests. Wait a minute and try again.',
    );
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);

    // Counted per pilot: someone else is still let through.
    await preview(other).expect(400);
  });

  it('counts each route on its own', async () => {
    // The pilot refused above can still read their hangar.
    await request(testApp.server)
      .get('/api/builds')
      .set('Authorization', `Bearer ${pilot.accessToken}`)
      .expect(200);
  });

  it('counts a visitor by address, and holds sign-in to ten a minute', async () => {
    for (let i = 0; i < 10; i += 1) {
      // Off to Google: the redirect is all the route does.
      await request(testApp.server).get('/api/auth/google').expect(302);
    }

    await request(testApp.server).get('/api/auth/google').expect(429);
  });

  it('never limits the health check', async () => {
    for (let i = 0; i < 310; i += 1) {
      await request(testApp.server).get('/api/health').expect(200);
    }
  });
});

import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { afterAll, beforeAll, describe, it } from 'vitest';

import { TokenService } from '../src/auth/services/token.service';
import type { Env } from '../src/config';
import { UsersFacade } from '../src/users';
import { type TestApp, createTestApp } from './support/app';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

/**
 * An access token is good only while its session stands. Signing out — on
 * one device or on all of them — ends its access at once, not when its 15
 * minutes run out.
 */
describe('signing out ends access at once', () => {
  let testApp: TestApp;
  const pilots: TestUser[] = [];

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    for (const pilot of pilots) {
      await deleteTestUser(testApp.app, pilot.id);
    }
    await testApp.close();
  });

  async function newPilot(label: string): Promise<TestUser> {
    const pilot = await createTestUser(testApp.app, label);
    pilots.push(pilot);
    return pilot;
  }

  /** One more Google sign-in by the same pilot: a session of its own. */
  async function anotherDevice(
    pilot: TestUser,
  ): Promise<{ access: string; cookie: string }> {
    const user = await testApp.app.get(UsersFacade).findById(pilot.id);
    if (!user) {
      throw new Error('the test pilot is missing');
    }
    const issued = await testApp.app.get(TokenService).issueForLogin(user);
    return { access: issued.accessToken, cookie: issued.refreshToken };
  }

  const read = (access: string): request.Test =>
    request(testApp.server).get('/api/builds').set('Authorization', `Bearer ${access}`);

  it('ends this device’s access token, and only this device’s', async () => {
    const pilot = await newPilot('instant-one');
    const phone = await anotherDevice(pilot);
    await read(phone.access).expect(200);

    await request(testApp.server)
      .post('/api/auth/logout')
      .set('Cookie', `spothub_rt=${phone.cookie}`)
      .expect(204);

    await read(phone.access).expect(401);
    // The pilot's other session, on another device, carries on.
    await read(pilot.accessToken).expect(200);
  });

  it('ends every device’s access token when signing out everywhere', async () => {
    const pilot = await newPilot('instant-all');
    const phone = await anotherDevice(pilot);
    const laptop = await anotherDevice(pilot);

    await request(testApp.server)
      .post('/api/auth/logout-all')
      .set('Authorization', `Bearer ${laptop.access}`)
      .expect(204);

    await read(phone.access).expect(401);
    await read(laptop.access).expect(401);
    await read(pilot.accessToken).expect(401);
  });

  it('refuses a token that names no session, as one issued before this did', async () => {
    const pilot = await newPilot('instant-old');
    const config = testApp.app.get<ConfigService<Env, true>>(ConfigService);
    const old = await testApp.app
      .get(JwtService)
      .signAsync(
        { sub: pilot.id, email: pilot.email, role: 'USER' },
        { secret: config.get('JWT_ACCESS_SECRET', { infer: true }), expiresIn: 600 },
      );

    await read(old).expect(401);
  });
});

import { createHash, randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RefreshTokenRepository } from '../src/auth/abstract/refresh-token.repository';
import { TokenService } from '../src/auth/services/token.service';
import type { Env } from '../src/config';
import { PrismaService } from '../src/prisma';
import { UsersFacade } from '../src/users';
import { type TestApp, createTestApp } from './support/app';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

const DAY = 24 * 60 * 60;

/**
 * A sign-in lasts 30 days from the last visit, and never more than 90 from
 * the Google sign-in it began with, however often it is used. Each refresh
 * carries the session's start forward, signed, so no refresh extends it.
 */
describe('session lifetime', () => {
  let testApp: TestApp;
  let pilot: TestUser;

  const config = (): ConfigService<Env, true> => testApp.app.get(ConfigService);

  beforeAll(async () => {
    testApp = await createTestApp();
    pilot = await createTestUser(testApp.app, 'session-pilot');
  });

  afterAll(async () => {
    await deleteTestUser(testApp.app, pilot.id);
    await testApp.close();
  });

  const refresh = (token: string): request.Test =>
    request(testApp.server)
      .post('/api/auth/refresh')
      .set('Cookie', `spothub_rt=${token}`);

  /** The cookie's lifetime, in seconds, from the Set-Cookie a refresh answered with. */
  const cookieMaxAge = (response: request.Response): number => {
    const cookies = ([] as string[]).concat(response.headers['set-cookie'] ?? []);
    const match = /Max-Age=(\d+)/.exec(
      cookies.find((c) => c.startsWith('spothub_rt=')) ?? '',
    );
    return Number(match?.[1]);
  };

  /**
   * A session as it would be had it begun `daysAgo` days ago: a refresh token
   * signed with the real secret and stored like any other.
   */
  async function sessionStarted(
    daysAgo: number,
  ): Promise<{ token: string; family: string }> {
    const id = randomUUID();
    const family = randomUUID();
    const started = Math.floor(Date.now() / 1000) - daysAgo * DAY;
    const token = await testApp.app
      .get(JwtService)
      .signAsync(
        { sub: pilot.id, jti: id, family, started },
        {
          secret: config().get('JWT_REFRESH_SECRET', { infer: true }),
          expiresIn: 30 * DAY,
        },
      );

    await testApp.app.get(RefreshTokenRepository).store({
      id,
      userId: pilot.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      familyId: family,
      expiresAt: new Date(Date.now() + 30 * DAY * 1000),
    });

    return { token, family };
  }

  it('gives a fresh sign-in 30 days, and a refresh 30 more', async () => {
    const user = await testApp.app.get(UsersFacade).findById(pilot.id);
    if (!user) {
      throw new Error('the test pilot is missing');
    }

    const signedIn = await testApp.app.get(TokenService).issueForLogin(user);
    expect(signedIn.refreshTokenTtl).toBe(30 * DAY);

    const response = await refresh(signedIn.refreshToken).expect(200);
    expect(cookieMaxAge(response)).toBeGreaterThan(30 * DAY - 60);
  });

  it('never refreshes past 90 days from the sign-in', async () => {
    const { token } = await sessionStarted(80);

    const response = await refresh(token).expect(200);

    // Ten days left of the ninety, not another thirty.
    expect(cookieMaxAge(response)).toBeLessThanOrEqual(10 * DAY);
    expect(cookieMaxAge(response)).toBeGreaterThan(10 * DAY - 60);
  });

  it('ends a session past 90 days, and revokes it', async () => {
    const { token, family } = await sessionStarted(91);

    await refresh(token).expect(401);

    const rows = await testApp.app
      .get(PrismaService)
      .refreshToken.findMany({ where: { familyId: family } });
    expect(rows.every((row) => row.revokedAt !== null)).toBe(true);
  });
});

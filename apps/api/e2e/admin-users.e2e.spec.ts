import { ForbiddenException } from '@nestjs/common';
import type { AdminUserDto, CurrentUserDto } from '@spothub/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthService } from '../src/auth/services/auth.service';
import { PrismaService } from '../src/prisma';
import { type TestApp, createTestApp } from './support/app';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

/**
 * The Admin page's pilots: only an admin lists them or changes one, a
 * read-only pilot may look but not write, and a blocked one is refused at
 * once — on the next request, not when their token runs out.
 */
describe('admin: pilots', () => {
  let testApp: TestApp;
  let admin: TestUser;
  let pilot: TestUser;

  beforeAll(async () => {
    testApp = await createTestApp();
    admin = await createTestUser(testApp.app, 'pilots-admin');
    pilot = await createTestUser(testApp.app, 'pilots-pilot');

    await testApp.app
      .get(PrismaService)
      .user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
  });

  afterAll(async () => {
    await deleteTestUser(testApp.app, admin.id);
    await deleteTestUser(testApp.app, pilot.id);
    await testApp.close();
  });

  const as = (user: TestUser): string => `Bearer ${user.accessToken}`;

  const setStatus = (user: TestUser, id: string, status: string): request.Test =>
    request(testApp.server)
      .patch(`/api/admin/users/${id}`)
      .set('Authorization', as(user))
      .send({ status });

  const createBuild = (user: TestUser): request.Test =>
    request(testApp.server)
      .post('/api/builds')
      .set('Authorization', as(user))
      .send({ name: 'Read-only check' });

  it('lists every pilot to an admin, marking the admin’s own row', async () => {
    const users = (
      await request(testApp.server)
        .get('/api/admin/users')
        .set('Authorization', as(admin))
        .expect(200)
    ).body as AdminUserDto[];

    const own = users.find((user) => user.id === admin.id);
    const other = users.find((user) => user.id === pilot.id);

    expect(own).toMatchObject({ isViewer: true, role: 'ADMIN' });
    expect(other).toMatchObject({ isViewer: false, status: 'ACTIVE' });
    expect(other?.lastSignInAt).not.toBeNull();
  });

  it('is the admin’s alone', async () => {
    await request(testApp.server)
      .get('/api/admin/users')
      .set('Authorization', as(pilot))
      .expect(403);
    await setStatus(pilot, admin.id, 'BLOCKED').expect(403);
  });

  it('never blocks or restricts an admin, the viewer included', async () => {
    await setStatus(admin, admin.id, 'BLOCKED').expect(400);
  });

  it('lets a read-only pilot look and sign out, but not change anything', async () => {
    await setStatus(admin, pilot.id, 'RESTRICTED').expect(200);

    const me = (
      await request(testApp.server)
        .get('/api/auth/me')
        .set('Authorization', as(pilot))
        .expect(200)
    ).body as CurrentUserDto;
    expect(me.status).toBe('RESTRICTED');

    await request(testApp.server)
      .get('/api/builds')
      .set('Authorization', as(pilot))
      .expect(200);
    await createBuild(pilot).expect(403);
    await request(testApp.server).post('/api/auth/logout').expect(204);

    await setStatus(admin, pilot.id, 'ACTIVE').expect(200);
    const build = await createBuild(pilot).expect(201);
    await request(testApp.server)
      .delete(`/api/builds/${(build.body as { id: string }).id}`)
      .set('Authorization', as(pilot))
      .expect(204);
  });

  it('refuses a blocked pilot at once, and at the next sign-in', async () => {
    const blocked = (await setStatus(admin, pilot.id, 'BLOCKED').expect(200))
      .body as AdminUserDto;
    expect(blocked.status).toBe('BLOCKED');

    // The same, still unexpired, access token stops working immediately.
    await request(testApp.server)
      .get('/api/builds')
      .set('Authorization', as(pilot))
      .expect(401);

    await expect(
      testApp.app.get(AuthService).signInWithGoogle({
        subject: 'not-linked-yet',
        email: pilot.email,
        displayName: null,
        avatarUrl: null,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await setStatus(admin, pilot.id, 'ACTIVE').expect(200);
    await request(testApp.server)
      .get('/api/builds')
      .set('Authorization', as(pilot))
      .expect(200);
  });
});

import { createHash, randomUUID } from 'node:crypto';

import type {
  AdminUserDto,
  AppSettingsDto,
  BuildDto,
  StorageUsageDto,
} from '@spothub/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/prisma';
import { type TestApp, createTestApp } from './support/app';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

const MB = 1024 ** 2;

/**
 * A storage limit per pilot: photos, post images and flight logs count
 * against it from the moment an upload is signed, the next one past it is
 * refused with 413, and an admin can give one pilot more room than the
 * default. No bytes are uploaded — a signed upload is what counts.
 */
describe('storage limit', () => {
  let testApp: TestApp;
  let admin: TestUser;
  let pilot: TestUser;
  let build: BuildDto;
  let before: AppSettingsDto;

  beforeAll(async () => {
    testApp = await createTestApp();
    admin = await createTestUser(testApp.app, 'quota-admin');
    pilot = await createTestUser(testApp.app, 'quota-pilot');

    await testApp.app
      .get(PrismaService)
      .user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });

    build = (
      await request(testApp.server)
        .post('/api/builds')
        .set('Authorization', as(pilot))
        .send({ name: 'Quota quad' })
        .expect(201)
    ).body as BuildDto;

    before = (
      await request(testApp.server)
        .get('/api/admin/settings')
        .set('Authorization', as(admin))
        .expect(200)
    ).body as AppSettingsDto;
  });

  afterAll(async () => {
    await request(testApp.server)
      .patch('/api/admin/settings')
      .set('Authorization', as(admin))
      .send({ defaultStorageQuotaBytes: before.defaultStorageQuotaBytes })
      .expect(200);
    await deleteTestUser(testApp.app, admin.id);
    await deleteTestUser(testApp.app, pilot.id);
    await testApp.close();
  });

  function as(user: TestUser): string {
    return `Bearer ${user.accessToken}`;
  }

  const photo = (sizeBytes: number): request.Test =>
    request(testApp.server)
      .post(`/api/builds/${build.id}/photos/uploads`)
      .set('Authorization', as(pilot))
      .send({ fileName: 'quad.jpg', mime: 'image/jpeg', sizeBytes });

  const log = (sizeBytes: number): request.Test =>
    request(testApp.server)
      .post('/api/flight-logs/uploads')
      .set('Authorization', as(pilot))
      .send({
        fileName: `Quad-${randomUUID()}.csv`,
        sizeBytes,
        checksum: createHash('sha256').update(randomUUID()).digest('hex'),
      });

  const setLimit = (bytes: number | null): request.Test =>
    request(testApp.server)
      .patch(`/api/admin/users/${pilot.id}`)
      .set('Authorization', as(admin))
      .send({ storageQuotaBytes: bytes });

  async function usage(): Promise<StorageUsageDto> {
    return (
      await request(testApp.server)
        .get('/api/users/me/storage')
        .set('Authorization', as(pilot))
        .expect(200)
    ).body as StorageUsageDto;
  }

  it('starts every pilot on the default limit, with nothing used', async () => {
    expect(await usage()).toEqual({
      usedBytes: 0,
      limitBytes: before.defaultStorageQuotaBytes,
    });
  });

  it('counts photos and logs together, and refuses the upload that would go past', async () => {
    const saved = (await setLimit(100 * MB).expect(200)).body as AdminUserDto;
    expect(saved).toMatchObject({
      storageQuotaBytes: 100 * MB,
      storageLimitBytes: 100 * MB,
    });

    await photo(25 * MB).expect(200);
    await photo(25 * MB).expect(200);
    await log(25 * MB).expect(200);
    await photo(20 * MB).expect(200);

    expect((await usage()).usedBytes).toBe(95 * MB);

    // Exactly to the limit fits; a byte more does not.
    await photo(5 * MB + 1).expect(413);
    const refused = await log(5 * MB + 1).expect(413);
    expect((refused.body as { message: string }).message).toContain('95 MB of 100 MB');
    await photo(5 * MB).expect(200);
  });

  it('shows the admin what each pilot uses', async () => {
    const users = (
      await request(testApp.server)
        .get('/api/admin/users')
        .set('Authorization', as(admin))
        .expect(200)
    ).body as AdminUserDto[];

    expect(users.find((user) => user.id === pilot.id)).toMatchObject({
      storageUsedBytes: 100 * MB,
      storageLimitBytes: 100 * MB,
    });
  });

  it('puts a pilot back on the default, which the admin can change', async () => {
    await setLimit(null).expect(200);

    await request(testApp.server)
      .patch('/api/admin/settings')
      .set('Authorization', as(admin))
      .send({ defaultStorageQuotaBytes: 200 * MB })
      .expect(200);

    expect(await usage()).toEqual({ usedBytes: 100 * MB, limitBytes: 200 * MB });
    await photo(25 * MB).expect(200);
  });

  it('refuses a limit too small or too large to be meant', async () => {
    await setLimit(1024).expect(400);
    await request(testApp.server)
      .patch('/api/admin/settings')
      .set('Authorization', as(admin))
      .send({ defaultStorageQuotaBytes: 2 * 1024 ** 4 })
      .expect(400);
  });
});

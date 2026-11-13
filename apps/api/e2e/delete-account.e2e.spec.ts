import { createHash, randomUUID } from 'node:crypto';

import type { BuildDto, LogUploadTicketDto, UploadTicketDto } from '@spothub/shared';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/prisma';
import { StorageGateway } from '../src/storage';
import { type TestApp, createTestApp } from './support/app';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

/**
 * A pilot deleting their own account: every row and every stored file goes,
 * the session ends, and the site is never left without an admin.
 */
describe('delete my account', () => {
  let testApp: TestApp;
  let pilot: TestUser;
  let admin: TestUser;

  beforeAll(async () => {
    testApp = await createTestApp();
    pilot = await createTestUser(testApp.app, 'leaving-pilot');
    admin = await createTestUser(testApp.app, 'leaving-admin');
  });

  afterAll(async () => {
    const prisma = testApp.app.get(PrismaService);
    // The pilot deleted themselves; anything still here is a failed test's.
    await prisma.user.deleteMany({ where: { id: pilot.id } });
    await deleteTestUser(testApp.app, admin.id);
    await testApp.close();
  });

  const as = (user: TestUser): string => `Bearer ${user.accessToken}`;
  const prisma = (): PrismaService => testApp.app.get(PrismaService);

  async function postAs<T>(path: string, body: object): Promise<T> {
    const response = await request(testApp.server)
      .post(path)
      .set('Authorization', as(pilot))
      .send(body);

    if (response.status >= 300) {
      throw new Error(`POST ${path} answered ${String(response.status)}`);
    }

    return response.body as T;
  }

  it('takes every row and every stored file with it, and ends the session', async () => {
    // A build with a real photo, and a flight log's bytes in storage.
    const build = await postAs<BuildDto>('/api/builds', { name: 'Leaving quad' });
    const image = await sharp({
      create: { width: 64, height: 48, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .toBuffer();
    const photo = await postAs<UploadTicketDto>(
      `/api/builds/${build.id}/photos/uploads`,
      {
        fileName: 'quad.jpg',
        mime: 'image/jpeg',
        sizeBytes: image.byteLength,
      },
    );
    await fetch(photo.uploadUrl, {
      method: 'PUT',
      body: image,
      headers: { 'Content-Type': photo.contentType },
    });
    await postAs(`/api/builds/${build.id}/photos/${photo.assetId}/commit`, {});

    const csv = Buffer.from('Date,Time\n2026-11-10,10:00:00.000\n');
    const log = await postAs<LogUploadTicketDto>('/api/flight-logs/uploads', {
      fileName: `Quad-${randomUUID()}.csv`,
      sizeBytes: csv.byteLength,
      checksum: createHash('sha256').update(csv).digest('hex'),
    });
    await fetch(log.uploadUrl, {
      method: 'PUT',
      body: csv,
      headers: { 'Content-Type': log.contentType },
    });

    const keys = [
      ...(await prisma().asset.findMany({ where: { ownerId: pilot.id } })).map(
        (asset) => asset.storageKey,
      ),
      ...(await prisma().logFile.findMany({ where: { ownerId: pilot.id } })).map(
        (file) => file.storageKey,
      ),
    ];
    const storage = testApp.app.get(StorageGateway);

    // The photo, its thumbnail, its display version and the log are all really there.
    expect(keys).toHaveLength(4);
    for (const key of keys) {
      expect(await storage.head(key)).not.toBeNull();
    }

    const deleted = await request(testApp.server)
      .delete('/api/auth/me')
      .set('Authorization', as(pilot))
      .expect(204);

    // The refresh cookie is cleared, so the browser holds nothing to come back with.
    expect(JSON.stringify(deleted.headers)).toMatch(/Expires=Thu, 01 Jan 1970/);

    expect(await prisma().user.count({ where: { id: pilot.id } })).toBe(0);
    expect(await prisma().build.count({ where: { id: build.id } })).toBe(0);
    for (const key of keys) {
      expect(await storage.head(key)).toBeNull();
    }

    await request(testApp.server)
      .get('/api/builds')
      .set('Authorization', as(pilot))
      .expect(401);
  });

  it('is open to a read-only account too: nothing stands between someone and leaving', async () => {
    const leaving = await createTestUser(testApp.app, 'leaving-restricted');
    await prisma().user.update({
      where: { id: leaving.id },
      data: { status: 'RESTRICTED' },
    });

    await request(testApp.server)
      .delete('/api/auth/me')
      .set('Authorization', as(leaving))
      .expect(204);

    expect(await prisma().user.count({ where: { id: leaving.id } })).toBe(0);
  });

  it('refuses the only admin, so the site is never left without one', async () => {
    // Other admins left in this test database by earlier runs step aside for
    // the length of this test, and are put back after it.
    const others = await prisma().user.findMany({
      where: { role: 'ADMIN', id: { not: admin.id } },
      select: { id: true },
    });
    const ids = others.map((user) => user.id);

    await prisma().user.updateMany({
      where: { id: { in: ids } },
      data: { role: 'USER' },
    });
    await prisma().user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });

    try {
      await request(testApp.server)
        .delete('/api/auth/me')
        .set('Authorization', as(admin))
        .expect(409);
      expect(await prisma().user.count({ where: { id: admin.id } })).toBe(1);
    } finally {
      await prisma().user.updateMany({
        where: { id: { in: ids } },
        data: { role: 'ADMIN' },
      });
    }
  });
});

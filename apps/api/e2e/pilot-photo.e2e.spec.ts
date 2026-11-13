import type {
  AdminUserDto,
  BuildDto,
  ConversationDto,
  CurrentUserDto,
  PilotPhotoDto,
  PostSummaryDto,
  StorageUsageDto,
  UploadTicketDto,
} from '@spothub/shared';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/prisma';
import { StorageGateway } from '../src/storage';
import { type TestApp, createTestApp } from './support/app';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

/**
 * A pilot's profile photo: uploaded through the presigned rails, cropped to a
 * small square with its EXIF gone, counted toward their storage, and shown
 * at a lasting address beside their name everywhere others see it.
 */
describe('pilot photo', () => {
  let testApp: TestApp;
  let pilot: TestUser;
  let reader: TestUser;
  let admin: TestUser;
  let prisma: PrismaService;
  let storage: StorageGateway;

  beforeAll(async () => {
    testApp = await createTestApp();
    pilot = await createTestUser(testApp.app, 'photo-pilot');
    reader = await createTestUser(testApp.app, 'photo-reader');
    admin = await createTestUser(testApp.app, 'photo-admin');
    prisma = testApp.app.get(PrismaService);
    storage = testApp.app.get(StorageGateway);
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
  });

  afterAll(async () => {
    for (const user of [pilot, reader, admin]) {
      await deleteTestUser(testApp.app, user.id);
    }
    await testApp.close();
  });

  const as = (user: TestUser): string => `Bearer ${user.accessToken}`;

  async function get<T>(user: TestUser | null, path: string): Promise<T> {
    const call = request(testApp.server).get(path);
    return (await (user ? call.set('Authorization', as(user)) : call).expect(200))
      .body as T;
  }

  /** A landscape JPEG carrying GPS in its EXIF, as a phone would take it. */
  async function phonePhoto(): Promise<Buffer> {
    return sharp({
      create: {
        width: 640,
        height: 480,
        channels: 3,
        background: { r: 30, g: 90, b: 160 },
      },
    })
      .jpeg()
      .withExifMerge({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '49/1 30/1 0/1' } })
      .toBuffer();
  }

  async function upload(user: TestUser, body: Buffer): Promise<string> {
    const ticket = (
      await request(testApp.server)
        .post('/api/users/me/photo/uploads')
        .set('Authorization', as(user))
        .send({ fileName: 'me.jpg', mime: 'image/jpeg', sizeBytes: body.byteLength })
        .expect(200)
    ).body as UploadTicketDto;

    const put = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      body: new Uint8Array(body),
      headers: { 'Content-Type': ticket.contentType },
    });
    expect(put.ok).toBe(true);
    return ticket.assetId;
  }

  const commit = (user: TestUser, assetId: string): request.Test =>
    request(testApp.server)
      .post(`/api/users/me/photo/uploads/${assetId}/commit`)
      .set('Authorization', as(user));

  const photoKey = async (userId: string): Promise<string | null> =>
    (
      await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { photo: { select: { storageKey: true } } },
      })
    ).photo?.storageKey ?? null;

  let first: string;

  it('makes a 256 px square WebP with no EXIF, kept under the pilot’s own folder', async () => {
    const assetId = await upload(pilot, await phonePhoto());
    const committed = (await commit(pilot, assetId).expect(200)).body as PilotPhotoDto;

    expect(committed.photoUrl).toBe(`/api/users/${pilot.id}/photo?v=${assetId}`);

    const key = await photoKey(pilot.id);
    expect(key).toMatch(new RegExp(`^${pilot.id}/photo/[0-9a-f-]+\\.webp$`));
    first = key ?? '';

    const stored = await storage.get(first);
    const meta = await sharp(stored?.body).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 256, 256]);
    expect(meta.exif).toBeUndefined();

    // The upload itself is gone; only the square is kept.
    expect(await prisma.asset.count({ where: { ownerId: pilot.id } })).toBe(1);
    const me = await get<CurrentUserDto>(pilot, '/api/auth/me');
    expect(me.photoUrl).toBe(committed.photoUrl);
  });

  it('serves it to anyone, signed in or not, at the lasting address', async () => {
    const answer = await request(testApp.server)
      .get(`/api/users/${pilot.id}/photo`)
      .expect(302);
    expect(answer.headers['cache-control']).toContain('max-age=300');

    const image = await fetch(answer.headers['location'] ?? '');
    expect(image.status).toBe(200);

    await request(testApp.server).get(`/api/users/${reader.id}/photo`).expect(404);
  });

  it('counts toward the storage limit', async () => {
    const usage = await get<StorageUsageDto>(pilot, '/api/users/me/storage');
    expect(usage.usedBytes).toBeGreaterThan(0);
    expect(usage.usedBytes).toBeLessThan(50_000);
  });

  it('stands beside their name: shared builds, posts, comments and the Pilots table', async () => {
    const build = (
      await request(testApp.server)
        .post('/api/builds')
        .set('Authorization', as(pilot))
        .send({ name: 'Photographed quad', visibility: 'PUBLIC' })
        .expect(201)
    ).body as BuildDto;
    const post = (
      await request(testApp.server)
        .post('/api/posts')
        .set('Authorization', as(pilot))
        .send({ title: 'A post with a face', visibility: 'PUBLIC' })
        .expect(201)
    ).body as PostSummaryDto;
    await request(testApp.server)
      .post(`/api/posts/${post.id}/comments`)
      .set('Authorization', as(pilot))
      .send({ body: 'Hello' })
      .expect(201);

    const photoUrl = (await get<CurrentUserDto>(pilot, '/api/auth/me')).photoUrl;
    expect(photoUrl).not.toBeNull();

    expect((await get<BuildDto>(reader, `/api/builds/${build.id}`)).ownerPhotoUrl).toBe(
      photoUrl,
    );
    const feed = await get<PostSummaryDto[]>(null, '/api/posts/published');
    expect(feed.find((p) => p.id === post.id)?.authorPhotoUrl).toBe(photoUrl);
    const conversation = await get<ConversationDto>(
      null,
      `/api/posts/${post.id}/comments`,
    );
    expect(conversation.questions[0].authorPhotoUrl).toBe(photoUrl);
    const pilots = await get<AdminUserDto[]>(admin, '/api/admin/users');
    expect(pilots.find((u) => u.id === pilot.id)?.photoUrl).toBe(photoUrl);
    expect(pilots.find((u) => u.id === reader.id)?.photoUrl).toBeNull();
  });

  it('a new photo replaces the old one, deleting it', async () => {
    const assetId = await upload(pilot, await phonePhoto());
    await commit(pilot, assetId).expect(200);

    expect(await storage.get(first)).toBeNull();
    expect(await prisma.asset.count({ where: { ownerId: pilot.id } })).toBe(1);
  });

  it('refuses what is not an image, and leaves nothing behind', async () => {
    const before = await photoKey(pilot.id);
    const assetId = await upload(pilot, Buffer.from('not a picture at all'));
    await commit(pilot, assetId).expect(400);

    expect(await photoKey(pilot.id)).toBe(before);
    expect(await prisma.asset.count({ where: { id: assetId } })).toBe(0);
  });

  it('commits only a photo upload, and only the pilot’s own', async () => {
    const assetId = await upload(pilot, await phonePhoto());
    await commit(reader, assetId).expect(404);

    // A build photo's upload cannot become a face.
    const build = (
      await request(testApp.server)
        .post('/api/builds')
        .set('Authorization', as(reader))
        .send({ name: 'Reader quad' })
        .expect(201)
    ).body as BuildDto;
    const photo = (
      await request(testApp.server)
        .post(`/api/builds/${build.id}/photos/uploads`)
        .set('Authorization', as(reader))
        .send({ fileName: 'quad.jpg', mime: 'image/jpeg', sizeBytes: 1000 })
        .expect(200)
    ).body as UploadTicketDto;
    await commit(reader, photo.assetId).expect(404);
  });

  it('removing it deletes the file, and the address answers 404', async () => {
    const key = await photoKey(pilot.id);
    const removed = (
      await request(testApp.server)
        .delete('/api/users/me/photo')
        .set('Authorization', as(pilot))
        .expect(200)
    ).body as PilotPhotoDto;

    expect(removed.photoUrl).toBeNull();
    expect(await storage.get(key ?? '')).toBeNull();
    await request(testApp.server).get(`/api/users/${pilot.id}/photo`).expect(404);
    expect((await get<CurrentUserDto>(pilot, '/api/auth/me')).photoUrl).toBeNull();
  });
});

import type { AssetDto, BuildDto, UploadTicketDto } from '@spothub/shared';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DisplayBackfillJob } from '../src/media/display-backfill.job';
import { PrismaService } from '../src/prisma';
import { StorageGateway } from '../src/storage';
import { type TestApp, createTestApp } from './support/app';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

/**
 * Every image gets a display version on upload — at most 1600 px, WebP —
 * which a gallery, a viewer and a post body show instead of the original.
 * It is counted toward the owner's storage, deleted with the image, and made
 * by a backfill for images from before it existed.
 */
describe('display-size photos', () => {
  let testApp: TestApp;
  let pilot: TestUser;
  let build: BuildDto;

  const as = (): string => `Bearer ${pilot.accessToken}`;
  const prisma = (): PrismaService => testApp.app.get(PrismaService);
  const storage = (): StorageGateway => testApp.app.get(StorageGateway);

  beforeAll(async () => {
    testApp = await createTestApp();
    pilot = await createTestUser(testApp.app, 'display-photos');
    build = (
      await request(testApp.server)
        .post('/api/builds')
        .set('Authorization', as())
        .send({ name: 'Display quad' })
        .expect(201)
    ).body as BuildDto;
  });

  afterAll(async () => {
    await deleteTestUser(testApp.app, pilot.id);
    await testApp.close();
  });

  /** A camera-sized photo through the real pipeline: ask, PUT to storage, commit. */
  async function uploadPhoto(width: number, height: number): Promise<AssetDto> {
    const image = await sharp({
      create: { width, height, channels: 3, background: { r: 255, g: 187, b: 0 } },
    })
      .jpeg()
      .toBuffer();

    const ticket = (
      await request(testApp.server)
        .post(`/api/builds/${build.id}/photos/uploads`)
        .set('Authorization', as())
        .send({ fileName: 'field.jpg', mime: 'image/jpeg', sizeBytes: image.byteLength })
        .expect(200)
    ).body as UploadTicketDto;

    const put = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      body: image,
      headers: { 'Content-Type': ticket.contentType },
    });
    expect(put.ok).toBe(true);

    return (
      await request(testApp.server)
        .post(`/api/builds/${build.id}/photos/${ticket.assetId}/commit`)
        .set('Authorization', as())
        .send({})
        .expect(200)
    ).body as AssetDto;
  }

  /** What these tests read of an image's display version, from its own row. */
  interface WithDisplay {
    readonly display: {
      readonly id: string;
      readonly kind: string;
      readonly storageKey: string;
      readonly sizeBytes: bigint | null;
      readonly width: number | null;
      readonly height: number | null;
    } | null;
  }

  function displayRow(assetId: string): Promise<WithDisplay> {
    return prisma().asset.findUniqueOrThrow({
      where: { id: assetId },
      include: { display: true },
    });
  }

  it('makes a display version on upload: 1600 px at most, WebP, counted', async () => {
    const photo = await uploadPhoto(3200, 2400);

    expect(photo.displayUrl).toEqual(expect.stringContaining('http'));

    const asset = await displayRow(photo.id);
    expect(asset.display).not.toBeNull();
    expect(asset.display?.kind).toBe('DISPLAY');
    expect(asset.display?.storageKey.startsWith(`${pilot.id}/`)).toBe(true);

    const stored = await storage().get(asset.display?.storageKey ?? '');
    const meta = await sharp(stored?.body).metadata();
    expect(meta.format).toBe('webp');
    expect([meta.width, meta.height]).toEqual([1600, 1200]);

    // Real bytes the pilot asked for, so they count.
    expect(Number(asset.display?.sizeBytes)).toBe(stored?.body.byteLength);
  });

  it('never enlarges a small photo', async () => {
    const photo = await uploadPhoto(800, 600);
    const asset = await displayRow(photo.id);

    expect([asset.display?.width, asset.display?.height]).toEqual([800, 600]);
  });

  it('deletes the display version with the photo', async () => {
    const photo = await uploadPhoto(2000, 1500);
    const asset = await displayRow(photo.id);
    const key = asset.display?.storageKey ?? '';
    expect(await storage().head(key)).not.toBeNull();

    await request(testApp.server)
      .delete(`/api/builds/${build.id}/photos/${photo.id}`)
      .set('Authorization', as())
      .expect(204);

    expect(await storage().head(key)).toBeNull();
    expect(await prisma().asset.count({ where: { storageKey: key } })).toBe(0);
  });

  it('gives a photo from before display versions existed one, through the backfill', async () => {
    const photo = await uploadPhoto(2400, 1600);
    const before = await displayRow(photo.id);

    // As it was before this existed: no display version at all.
    await prisma().asset.update({ where: { id: photo.id }, data: { displayId: null } });
    await prisma().asset.delete({ where: { id: before.display?.id ?? '' } });
    await storage().delete([before.display?.storageKey ?? '']);

    await testApp.app.get(DisplayBackfillJob).backfill();

    const after = await displayRow(photo.id);
    expect(after.display).not.toBeNull();
    expect([after.display?.width, after.display?.height]).toEqual([1600, 1067]);
    expect(await storage().head(after.display?.storageKey ?? '')).not.toBeNull();

    // And a second run finds nothing left to do.
    await testApp.app.get(DisplayBackfillJob).backfill();
    expect((await displayRow(photo.id)).display?.id).toBe(after.display?.id);
  });
});

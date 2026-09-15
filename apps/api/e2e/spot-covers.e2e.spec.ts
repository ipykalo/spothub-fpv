import type { SpotDto } from '@spothub/shared';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/prisma';
import { StorageGateway } from '../src/storage';
import { type TestApp, createTestApp } from './support/app';
import { VIDEO_WITHOUT_THUMBNAIL } from './support/stub-youtube-thumbnails';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

const WAIT_MS = 15_000;

/**
 * A spot's cover is its video's thumbnail, made by a background job and kept
 * in our own storage. YouTube is stubbed (`StubYouTubeThumbnails`); storage
 * and the job queue are real, so these tests prove the object that lands, the
 * one that is served, and every one that must be deleted.
 */
describe('spot covers', () => {
  let testApp: TestApp;
  let owner: TestUser;
  let prisma: PrismaService;
  let storage: StorageGateway;

  beforeAll(async () => {
    testApp = await createTestApp();
    owner = await createTestUser(testApp.app, 'spot-covers');
    prisma = testApp.app.get(PrismaService);
    storage = testApp.app.get(StorageGateway);
  });

  afterAll(async () => {
    await deleteTestUser(testApp.app, owner.id);
    await testApp.close();
  });

  const auth = (): string => `Bearer ${owner.accessToken}`;

  /** The job runs in the background, so wait for its outcome rather than a fixed delay. */
  async function waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean, what: string): Promise<T> {
    const deadline = Date.now() + WAIT_MS;

    for (;;) {
      const value = await read();

      if (done(value)) {
        return value;
      }

      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for ${what}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  async function coverKeyOf(spotId: string): Promise<string | null> {
    const row = await prisma.spot.findUnique({
      where: { id: spotId },
      select: { coverStorageKey: true },
    });

    return row?.coverStorageKey ?? null;
  }

  const waitForCover = (spotId: string, youtubeId: string): Promise<string | null> =>
    waitFor(
      () => coverKeyOf(spotId),
      (key) => key?.endsWith(`/cover-${youtubeId}.webp`) ?? false,
      `the cover for ${youtubeId}`,
    );

  const waitForCoverJobs = (spotId: string): Promise<number> =>
    waitFor(
      () =>
        prisma.job.count({
          where: {
            type: 'spot.cover',
            status: { in: ['QUEUED', 'RUNNING'] },
            payload: { path: ['spotId'], equals: spotId },
          },
        }),
      (pending) => pending === 0,
      'the cover jobs to finish',
    );

  async function createSpotWithVideo(youtubeId: string): Promise<SpotDto> {
    const response = await request(testApp.server)
      .post('/api/spots')
      .set('Authorization', auth())
      .send({ name: `Cover ${youtubeId}`, lat: 49.5, lng: 11.3, video: `https://youtu.be/${youtubeId}` })
      .expect(201);

    return response.body as SpotDto;
  }

  const patchSpot = async (spotId: string, body: object): Promise<SpotDto> =>
    (
      await request(testApp.server)
        .patch(`/api/spots/${spotId}`)
        .set('Authorization', auth())
        .send(body)
        .expect(200)
    ).body as SpotDto;

  it("makes a 16:9 WebP from the video's thumbnail and serves it from our storage", async () => {
    const spot = await createSpotWithVideo('aBcDeFgHi_1');
    const key = await waitForCover(spot.id, 'aBcDeFgHi_1');

    expect(key).toBe(`${owner.id}/spots/${spot.id}/cover-aBcDeFgHi_1.webp`);

    const fetched = await request(testApp.server)
      .get(`/api/spots/${spot.id}`)
      .set('Authorization', auth())
      .expect(200);

    const coverUrl = (fetched.body as SpotDto).coverUrl;
    expect(coverUrl).not.toBeNull();
    expect(coverUrl).not.toContain('ytimg');

    const image = await fetch(coverUrl ?? '');
    expect(image.status).toBe(200);

    const meta = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
    expect(meta.format).toBe('webp');
    expect([meta.width, meta.height]).toEqual([640, 360]);
  });

  it('replacing the video replaces the cover and deletes the old image', async () => {
    const spot = await createSpotWithVideo('aBcDeFgHi_2');
    const oldKey = await waitForCover(spot.id, 'aBcDeFgHi_2');

    const patched = await patchSpot(spot.id, { video: 'https://youtu.be/aBcDeFgHi_3' });
    expect(patched.coverUrl).toBeNull();

    const newKey = await waitForCover(spot.id, 'aBcDeFgHi_3');

    expect(await storage.get(oldKey ?? '')).toBeNull();
    expect(await storage.get(newKey ?? '')).not.toBeNull();
  });

  it('the same video with a new start time, or an unrelated change, keeps the cover', async () => {
    const spot = await createSpotWithVideo('aBcDeFgHi_4');
    const key = await waitForCover(spot.id, 'aBcDeFgHi_4');

    const restarted = await patchSpot(spot.id, { video: 'https://youtu.be/aBcDeFgHi_4?t=30' });
    expect(restarted.coverUrl).not.toBeNull();

    const renamed = await patchSpot(spot.id, { name: 'Renamed cover spot' });
    expect(renamed.coverUrl).not.toBeNull();

    expect(await coverKeyOf(spot.id)).toBe(key);
    expect(await storage.get(key ?? '')).not.toBeNull();
  });

  it('a video YouTube has no thumbnail for leaves the spot without a cover', async () => {
    const spot = await createSpotWithVideo('aBcDeFgHi_5');
    const oldKey = await waitForCover(spot.id, 'aBcDeFgHi_5');

    await patchSpot(spot.id, { video: `https://youtu.be/${VIDEO_WITHOUT_THUMBNAIL}` });
    await waitForCoverJobs(spot.id);

    expect(await coverKeyOf(spot.id)).toBeNull();
    expect(await storage.get(oldKey ?? '')).toBeNull();
  });

  it('removing the video removes the cover', async () => {
    const spot = await createSpotWithVideo('aBcDeFgHi_6');
    const key = await waitForCover(spot.id, 'aBcDeFgHi_6');

    const patched = await patchSpot(spot.id, { video: null });

    expect(patched.coverUrl).toBeNull();
    expect(await coverKeyOf(spot.id)).toBeNull();
    expect(await storage.get(key ?? '')).toBeNull();
  });

  it('deleting the spot deletes its cover', async () => {
    const spot = await createSpotWithVideo('aBcDeFgHi_7');
    const key = await waitForCover(spot.id, 'aBcDeFgHi_7');

    await request(testApp.server)
      .delete(`/api/spots/${spot.id}`)
      .set('Authorization', auth())
      .expect(204);

    expect(await storage.get(key ?? '')).toBeNull();
  });
});

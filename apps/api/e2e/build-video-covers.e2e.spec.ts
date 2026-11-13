import type { BuildDto, BuildVideoDto } from '@spothub/shared';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BuildVideoCoverJob } from '../src/build-videos/build-video-cover.job';
import { PrismaService } from '../src/prisma';
import { StorageGateway } from '../src/storage';
import { type TestApp, createTestApp } from './support/app';
import { waitForJobs } from './support/jobs';
import { VIDEO_WITHOUT_THUMBNAIL } from './support/stub-youtube-thumbnails';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

const WAIT_MS = 15_000;

/**
 * A build video's cover is its thumbnail, made by a background job and kept
 * in our own storage, as a spot's is. YouTube is stubbed
 * (`StubYouTubeThumbnails`); storage and the job queue are real, so these
 * tests prove the object that lands, the one that is served, and every one
 * that must be deleted.
 */
describe('build video covers', () => {
  let testApp: TestApp;
  let owner: TestUser;
  let prisma: PrismaService;
  let storage: StorageGateway;

  const started = new Date();

  beforeAll(async () => {
    testApp = await createTestApp();
    owner = await createTestUser(testApp.app, 'video-covers');
    prisma = testApp.app.get(PrismaService);
    storage = testApp.app.get(StorageGateway);
  });

  afterAll(async () => {
    await waitForJobs(testApp.app, 'build-video.cover', started);
    await deleteTestUser(testApp.app, owner.id);
    await testApp.close();
  });

  async function send<T>(
    method: 'get' | 'post' | 'delete',
    path: string,
    body?: object,
    expected = method === 'post' ? 201 : method === 'delete' ? 204 : 200,
  ): Promise<T> {
    const call = request(testApp.server)
      [method](path)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    const response = await (body ? call.send(body) : call).expect(expected);
    return response.body as T;
  }

  /** The job runs in the background, so wait for its outcome rather than a fixed delay. */
  async function waitFor<T>(
    read: () => Promise<T>,
    done: (value: T) => boolean,
    what: string,
  ): Promise<T> {
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

  async function coverKeyOf(videoId: string): Promise<string | null> {
    const row = await prisma.buildVideo.findUnique({
      where: { id: videoId },
      select: { coverStorageKey: true },
    });

    return row?.coverStorageKey ?? null;
  }

  const waitForCover = async (videoId: string): Promise<string> =>
    (await waitFor(
      () => coverKeyOf(videoId),
      (key) => key !== null,
      `the cover of video ${videoId}`,
    )) ?? '';

  const waitForCoverJobs = (videoId: string): Promise<number> =>
    waitFor(
      () =>
        prisma.job.count({
          where: {
            type: 'build-video.cover',
            status: { in: ['QUEUED', 'RUNNING'] },
            payload: { path: ['videoId'], equals: videoId },
          },
        }),
      (pending) => pending === 0,
      'the cover jobs to finish',
    );

  const newBuild = (name: string): Promise<BuildDto> =>
    send<BuildDto>('post', '/api/builds', { name });

  const addVideo = (buildId: string, youtubeId: string): Promise<BuildVideoDto> =>
    send<BuildVideoDto>('post', `/api/builds/${buildId}/videos`, {
      link: `https://youtu.be/${youtubeId}`,
    });

  it("makes a 16:9 WebP from the video's thumbnail and serves it from our storage", async () => {
    const build = await newBuild('Filmed quad');
    const added = await addVideo(build.id, 'bUiLdViD_01');
    expect(added.coverUrl).toBeNull();

    const key = await waitForCover(added.id);
    expect(key).toBe(`${owner.id}/builds/${build.id}/video-${added.id}.webp`);

    const [listed] = await send<BuildVideoDto[]>('get', `/api/builds/${build.id}/videos`);
    expect(listed.coverUrl).not.toBeNull();
    expect(listed.coverUrl).not.toContain('ytimg');

    const image = await fetch(listed.coverUrl ?? '');
    expect(image.status).toBe(200);

    const meta = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
    expect(meta.format).toBe('webp');
    expect([meta.width, meta.height]).toEqual([640, 360]);
  });

  it('a video YouTube has no thumbnail for keeps no cover', async () => {
    const build = await newBuild('Unlucky quad');
    const added = await addVideo(build.id, VIDEO_WITHOUT_THUMBNAIL);
    await waitForCoverJobs(added.id);

    expect(await coverKeyOf(added.id)).toBeNull();
    const [listed] = await send<BuildVideoDto[]>('get', `/api/builds/${build.id}/videos`);
    expect(listed.coverUrl).toBeNull();
  });

  it('removing the video deletes its cover', async () => {
    const build = await newBuild('Trimmed quad');
    const added = await addVideo(build.id, 'bUiLdViD_02');
    const key = await waitForCover(added.id);

    await send('delete', `/api/builds/${build.id}/videos/${added.id}`);
    expect(await storage.get(key)).toBeNull();
  });

  it('deleting the build deletes every cover of its videos', async () => {
    const build = await newBuild('Scrapped quad');
    const first = await addVideo(build.id, 'bUiLdViD_03');
    const second = await addVideo(build.id, 'bUiLdViD_04');
    const keys = [await waitForCover(first.id), await waitForCover(second.id)];

    await send('delete', `/api/builds/${build.id}`);

    for (const key of keys) {
      expect(await storage.get(key)).toBeNull();
    }
  });

  it('a video added before covers existed gets one at start-up', async () => {
    const build = await newBuild('Older quad');
    // As a row written before this feature: no cover, and no job queued for it.
    const older = await prisma.buildVideo.create({
      data: { buildId: build.id, youtubeId: 'bUiLdViD_05' },
    });

    await testApp.app.get(BuildVideoCoverJob).onApplicationBootstrap();

    expect(await waitForCover(older.id)).toBe(
      `${owner.id}/builds/${build.id}/video-${older.id}.webp`,
    );
  });
});

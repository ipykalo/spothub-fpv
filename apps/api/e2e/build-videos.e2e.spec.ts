import { type BuildDto, type BuildVideoDto, MAX_BUILD_VIDEOS } from '@spothub/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/prisma';
import { type TestApp, createTestApp } from './support/app';
import { waitForJobs } from './support/jobs';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

/**
 * YouTube videos on a build: only YouTube links are taken, whoever may open
 * the build sees them, and only its owner adds or removes one.
 */
describe('build videos', () => {
  let testApp: TestApp;
  let owner: TestUser;
  let stranger: TestUser;
  let shared: BuildDto;
  let secret: BuildDto;

  const started = new Date();

  beforeAll(async () => {
    testApp = await createTestApp();
    owner = await createTestUser(testApp.app, 'videos-owner');
    stranger = await createTestUser(testApp.app, 'videos-stranger');

    shared = await send<BuildDto>(owner, 'post', '/api/builds', {
      name: 'Filmed five-inch',
      visibility: 'PUBLIC',
    });
    secret = await send<BuildDto>(owner, 'post', '/api/builds', {
      name: 'Unfilmed prototype',
    });
  });

  afterAll(async () => {
    // Every video added queued its cover.
    await waitForJobs(testApp.app, 'build-video.cover', started);
    await deleteTestUser(testApp.app, owner.id);
    await deleteTestUser(testApp.app, stranger.id);
    await testApp.close();
  });

  async function send<T>(
    user: TestUser | null,
    method: 'get' | 'post' | 'delete',
    path: string,
    body?: object,
    expected = method === 'post' ? 201 : method === 'delete' ? 204 : 200,
  ): Promise<T> {
    let call = request(testApp.server)[method](path);

    if (user) {
      call = call.set('Authorization', `Bearer ${user.accessToken}`);
    }

    const response = await (body ? call.send(body) : call);
    expect(response.status, `${method.toUpperCase()} ${path}`).toBe(expected);
    return response.body as T;
  }

  const videos = (buildId: string): string => `/api/builds/${buildId}/videos`;

  it('stores a YouTube link as its id and start time, and nothing else', async () => {
    const added = await send<BuildVideoDto>(owner, 'post', videos(shared.id), {
      link: 'https://youtu.be/dQw4w9WgXcQ?t=75',
      title: '  First pack  ',
    });

    expect(added).toMatchObject({
      buildId: shared.id,
      youtubeId: 'dQw4w9WgXcQ',
      startS: 75,
      title: 'First pack',
    });

    const row = await testApp.app
      .get(PrismaService)
      .buildVideo.findUniqueOrThrow({ where: { id: added.id } });
    expect(JSON.stringify(row)).not.toContain('youtu.be');
  });

  it('refuses every link that is not a YouTube video', async () => {
    for (const link of [
      'https://evil.example/flight.mp4',
      'https://www.youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
      'javascript:alert(1)',
      'https://vimeo.com/123456',
      '',
      null,
    ]) {
      await send(owner, 'post', videos(shared.id), { link }, 400);
    }
  });

  it('shows a shared build’s videos to another pilot, but lets only the owner change them', async () => {
    const list = await send<BuildVideoDto[]>(stranger, 'get', videos(shared.id));
    expect(list.map((video) => video.title)).toContain('First pack');

    await send(
      stranger,
      'post',
      videos(shared.id),
      { link: 'https://youtu.be/dQw4w9WgXcQ' },
      404,
    );
    await send(stranger, 'delete', `${videos(shared.id)}/${list[0].id}`, undefined, 404);
    expect(await send<BuildVideoDto[]>(owner, 'get', videos(shared.id))).toHaveLength(1);
  });

  it('answers 404 for a build the reader may not open, and 401 to a visitor', async () => {
    await send(owner, 'post', videos(secret.id), {
      link: 'https://youtu.be/dQw4w9WgXcQ',
    });

    await send(stranger, 'get', videos(secret.id), undefined, 404);
    await send(null, 'get', videos(shared.id), undefined, 401);
  });

  it('holds a build to its limit', async () => {
    const existing = (await send<BuildVideoDto[]>(owner, 'get', videos(secret.id)))
      .length;

    for (let i = existing; i < MAX_BUILD_VIDEOS; i += 1) {
      await send(owner, 'post', videos(secret.id), {
        link: 'https://youtu.be/dQw4w9WgXcQ',
      });
    }

    await send(
      owner,
      'post',
      videos(secret.id),
      { link: 'https://youtu.be/dQw4w9WgXcQ' },
      409,
    );
  });

  it('removes a video for its owner', async () => {
    const [first] = await send<BuildVideoDto[]>(owner, 'get', videos(shared.id));

    await send(owner, 'delete', `${videos(shared.id)}/${first.id}`);
    expect(await send<BuildVideoDto[]>(owner, 'get', videos(shared.id))).toEqual([]);
  });
});

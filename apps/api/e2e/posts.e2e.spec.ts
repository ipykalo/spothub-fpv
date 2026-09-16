import type { BuildDto, PostDto, PostSummaryDto } from '@spothub/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type TestApp, createTestApp } from './support/app';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

/**
 * Blog posts, driven through the real routes as their author, another pilot
 * and a signed-out visitor. The tests run in order and follow one post from
 * draft to published to deleted, because the rules are about when it opens
 * and to whom.
 */
describe('posts', () => {
  let testApp: TestApp;
  let author: TestUser;
  let pilot: TestUser;
  let publicBuild: BuildDto;
  let privateBuild: BuildDto;
  let pilotsBuild: BuildDto;
  let post: PostDto;

  beforeAll(async () => {
    testApp = await createTestApp();
    author = await createTestUser(testApp.app, 'posts-author');
    pilot = await createTestUser(testApp.app, 'posts-pilot');

    publicBuild = await send<BuildDto>(author, 'post', '/api/builds', {
      name: 'Blogged five-inch',
      visibility: 'PUBLIC',
    });
    privateBuild = await send<BuildDto>(author, 'post', '/api/builds', {
      name: 'Secret prototype',
    });
    pilotsBuild = await send<BuildDto>(pilot, 'post', '/api/builds', {
      name: 'Someone else’s quad',
      visibility: 'PUBLIC',
    });
  });

  afterAll(async () => {
    await deleteTestUser(testApp.app, author.id);
    await deleteTestUser(testApp.app, pilot.id);
    await testApp.close();
  });

  const as = (user: TestUser): string => `Bearer ${user.accessToken}`;

  async function send<T>(
    user: TestUser,
    method: 'post' | 'patch',
    path: string,
    body: object,
    status?: number,
  ): Promise<T> {
    const response = await request(testApp.server)
      [method](path)
      .set('Authorization', as(user))
      .send(body);

    if (status !== undefined) {
      expect(response.status).toBe(status);
    } else if (response.status >= 300) {
      throw new Error(
        `${method.toUpperCase()} ${path} answered ${String(response.status)}: ${JSON.stringify(response.body)}`,
      );
    }

    return response.body as T;
  }

  async function get<T>(user: TestUser | null, path: string, status = 200): Promise<T> {
    const call = request(testApp.server).get(path);
    const response = await (user ? call.set('Authorization', as(user)) : call).expect(
      status,
    );
    return response.body as T;
  }

  const publishedIds = async (query = ''): Promise<string[]> =>
    (await get<PostSummaryDto[]>(null, `/api/posts/published${query}`)).map(
      (entry) => entry.id,
    );

  it('starts as a draft only its author can see', async () => {
    post = await send<PostDto>(author, 'post', '/api/posts', {
      title: 'Building a quiet five-inch',
      summary: '   ',
      bodyMd: '## Frame\n\nStarted with the arms.',
      buildIds: [publicBuild.id, privateBuild.id],
    });

    expect(post).toMatchObject({
      slug: 'building-a-quiet-five-inch',
      summary: null,
      visibility: 'PRIVATE',
      publishedAt: null,
      ownedByViewer: true,
      buildIds: [publicBuild.id, privateBuild.id],
    });
    expect(post.builds.map((build) => build.id)).toEqual([
      publicBuild.id,
      privateBuild.id,
    ]);

    await get(null, `/api/posts/${post.id}`, 404);
    await get(pilot, `/api/posts/${post.id}`, 404);
    expect(await publishedIds()).not.toContain(post.id);
    expect(
      (await get<PostSummaryDto[]>(author, '/api/posts')).map((entry) => entry.id),
    ).toContain(post.id);
  });

  it('links only the author’s own builds, however public someone else’s is', async () => {
    await send(
      author,
      'post',
      '/api/posts',
      { title: 'Borrowed quad', buildIds: [pilotsBuild.id] },
      400,
    );
    await send(
      author,
      'patch',
      `/api/posts/${post.id}`,
      { buildIds: [crypto.randomUUID()] },
      400,
    );
    await send(
      author,
      'post',
      '/api/posts',
      { title: 'Twice', buildIds: [publicBuild.id, publicBuild.id] },
      400,
    );
  });

  it('publishing opens it to anyone, with the builds left to signed-in readers', async () => {
    const published = await send<PostDto>(author, 'patch', `/api/posts/${post.id}`, {
      visibility: 'PUBLIC',
    });
    expect(published.publishedAt).not.toBeNull();

    const read = await get<PostDto>(null, `/api/posts/${post.id}`);
    expect(read).toMatchObject({
      ownedByViewer: false,
      bodyMd: '## Frame\n\nStarted with the arms.',
      buildIds: [],
    });
    // Builds are behind sign-in, so a visitor is shown none of them.
    expect(read.builds).toEqual([]);

    const forPilot = await get<PostDto>(pilot, `/api/posts/${post.id}`);
    expect(forPilot.builds.map((build) => build.id)).toEqual([publicBuild.id]);
    expect(forPilot.builds[0].ownedByViewer).toBe(false);

    expect(await publishedIds()).toContain(post.id);

    // On the blog, its tags are the linked builds the reader may open — none for a
    // visitor, the shared one for a signed-in pilot — and it reads in a minute.
    const listed = (await get<PostSummaryDto[]>(null, '/api/posts/published')).find(
      (entry) => entry.id === post.id,
    );
    expect(listed?.tags).toEqual([]);

    const listedForPilot = (
      await get<PostSummaryDto[]>(pilot, '/api/posts/published')
    ).find((entry) => entry.id === post.id);
    expect(listedForPilot?.tags).toEqual([
      { id: publicBuild.id, name: publicBuild.name, slug: publicBuild.slug },
    ]);
    expect(listed?.readingMinutes).toBe(1);
    expect(await publishedIds(`?buildId=${publicBuild.id}`)).toContain(post.id);
    expect(await publishedIds(`?buildId=${pilotsBuild.id}`)).not.toContain(post.id);

    // Back to a draft and out again: still the day it was first published.
    await send(author, 'patch', `/api/posts/${post.id}`, { visibility: 'PRIVATE' });
    await get(null, `/api/posts/${post.id}`, 404);
    const again = await send<PostDto>(author, 'patch', `/api/posts/${post.id}`, {
      visibility: 'PUBLIC',
    });
    expect(again.publishedAt).toBe(published.publishedAt);
  });

  it('an Unlisted post opens by its link but is not on the blog', async () => {
    const unlisted = await send<PostDto>(author, 'post', '/api/posts', {
      title: 'Link only',
      visibility: 'UNLISTED',
    });

    expect(unlisted.publishedAt).not.toBeNull();
    await get(null, `/api/posts/${unlisted.id}`);
    expect(await publishedIds()).not.toContain(unlisted.id);
  });

  it('only its author changes or deletes it, and writing needs signing in', async () => {
    const server = testApp.server;

    await send(pilot, 'patch', `/api/posts/${post.id}`, { title: 'Hijacked' }, 404);
    await request(server)
      .delete(`/api/posts/${post.id}`)
      .set('Authorization', as(pilot))
      .expect(404);
    await request(server)
      .patch(`/api/posts/${post.id}`)
      .send({ title: 'Hijacked' })
      .expect(401);
    await request(server).post('/api/posts').send({ title: 'Anonymous' }).expect(401);
    await request(server).get('/api/posts').expect(401);

    expect((await get<PostDto>(null, `/api/posts/${post.id}`)).title).toBe(
      'Building a quiet five-inch',
    );
  });

  it('relinking replaces the builds, in the order given', async () => {
    const relinked = await send<PostDto>(author, 'patch', `/api/posts/${post.id}`, {
      buildIds: [privateBuild.id, publicBuild.id],
    });

    expect(relinked.buildIds).toEqual([privateBuild.id, publicBuild.id]);
  });

  it('a deleted build drops out of the post, and a deleted post is gone', async () => {
    await request(testApp.server)
      .delete(`/api/builds/${privateBuild.id}`)
      .set('Authorization', as(author))
      .expect(204);
    expect((await get<PostDto>(author, `/api/posts/${post.id}`)).buildIds).toEqual([
      publicBuild.id,
    ]);

    await request(testApp.server)
      .delete(`/api/posts/${post.id}`)
      .set('Authorization', as(author))
      .expect(204);
    await get(author, `/api/posts/${post.id}`, 404);
    expect(await publishedIds()).not.toContain(post.id);
  });
});

import type { BuildDto, ConversationDto, PostDto, PostSummaryDto } from '@spothub/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type TestApp, createTestApp } from './support/app';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

/**
 * Builds are behind sign-in, whatever their visibility says: sharing decides
 * which signed-in pilots may open one, never whether a visitor may. The blog
 * is the only public page, and a post a visitor reads simply leaves out the
 * builds it is about.
 */
describe('builds are behind sign-in', () => {
  let testApp: TestApp;
  let owner: TestUser;
  let pilot: TestUser;
  let build: BuildDto;
  let post: PostDto;

  beforeAll(async () => {
    testApp = await createTestApp();
    owner = await createTestUser(testApp.app, 'private-builds-owner');
    pilot = await createTestUser(testApp.app, 'private-builds-pilot');

    build = await postAs<BuildDto>(owner, '/api/builds', {
      name: 'Shared five-inch',
      visibility: 'PUBLIC',
    });
    post = await postAs<PostDto>(owner, '/api/posts', {
      title: 'What I learned building it',
      visibility: 'PUBLIC',
      buildIds: [build.id],
    });
  });

  afterAll(async () => {
    await deleteTestUser(testApp.app, owner.id);
    await deleteTestUser(testApp.app, pilot.id);
    await testApp.close();
  });

  const as = (user: TestUser): string => `Bearer ${user.accessToken}`;

  async function postAs<T>(user: TestUser, path: string, body: object): Promise<T> {
    const response = await request(testApp.server)
      .post(path)
      .set('Authorization', as(user))
      .send(body)
      .expect(201);

    return response.body as T;
  }

  it('answers a visitor 401 on every read a build page used to make', async () => {
    const base = `/api/builds/${build.id}`;

    for (const path of [
      '/api/builds',
      '/api/builds/shared',
      base,
      `${base}/parts`,
      `${base}/repairs`,
      `${base}/photos`,
      `${base}/comments`,
      `${base}/likes`,
    ]) {
      await request(testApp.server).get(path).expect(401);
    }
  });

  it('no longer has a public builds list at all', async () => {
    // The route is gone; what is left is `:id`, which "public" is not a UUID for.
    await request(testApp.server).get('/api/builds/public').expect(401);
    await request(testApp.server)
      .get('/api/builds/public')
      .set('Authorization', as(pilot))
      .expect(400);
  });

  it('takes a bad token as no token, rather than as a visitor', async () => {
    await request(testApp.server)
      .get(`/api/builds/${build.id}`)
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });

  it('still opens a shared build for another signed-in pilot', async () => {
    const opened = (
      await request(testApp.server)
        .get(`/api/builds/${build.id}`)
        .set('Authorization', as(pilot))
        .expect(200)
    ).body as BuildDto;

    expect(opened.ownedByViewer).toBe(false);
    expect(opened.name).toBe('Shared five-inch');
  });

  it('leaves the builds out of a post a visitor reads, and keeps them for a pilot', async () => {
    const forVisitor = (
      await request(testApp.server).get(`/api/posts/${post.id}`).expect(200)
    ).body as PostDto;
    expect(forVisitor.builds).toEqual([]);
    expect(forVisitor.tags).toEqual([]);

    const blog = (await request(testApp.server).get('/api/posts/published').expect(200))
      .body as PostSummaryDto[];
    expect(blog.find((entry) => entry.id === post.id)?.tags).toEqual([]);

    const forPilot = (
      await request(testApp.server)
        .get(`/api/posts/${post.id}`)
        .set('Authorization', as(pilot))
        .expect(200)
    ).body as PostDto;
    expect(forPilot.builds.map((entry) => entry.id)).toEqual([build.id]);
    expect(forPilot.tags.map((tag) => tag.name)).toEqual(['Shared five-inch']);
  });

  it('keeps the rest of the blog public: the post, its comments and its likes', async () => {
    await request(testApp.server).get(`/api/posts/${post.id}/likes`).expect(200);

    const thread = (
      await request(testApp.server).get(`/api/posts/${post.id}/comments`).expect(200)
    ).body as ConversationDto;
    expect(thread.viewerOwnsSubject).toBe(false);
  });
});

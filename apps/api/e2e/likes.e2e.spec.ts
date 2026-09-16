import type { BuildDto, LikesDto, PostDto, PostSummaryDto } from '@spothub/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/prisma';
import { type TestApp, createTestApp } from './support/app';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

/**
 * Likes on posts and builds, as the author, two pilots and a signed-out
 * visitor: who may like, that a like counts once, and that counts reach the
 * posts and builds everyone reads. The tests run in order on the same subjects.
 */
describe('likes', () => {
  let testApp: TestApp;
  let author: TestUser;
  let pilot: TestUser;
  let other: TestUser;
  let post: PostDto;
  let draft: PostDto;
  let build: BuildDto;

  beforeAll(async () => {
    testApp = await createTestApp();
    author = await createTestUser(testApp.app, 'likes-author');
    pilot = await createTestUser(testApp.app, 'likes-pilot');
    other = await createTestUser(testApp.app, 'likes-other');

    post = await postAs<PostDto>(author, '/api/posts', {
      title: 'Liked post',
      visibility: 'PUBLIC',
    });
    draft = await postAs<PostDto>(author, '/api/posts', { title: 'Unseen draft' });
    build = await postAs<BuildDto>(author, '/api/builds', {
      name: 'Liked build',
      visibility: 'PUBLIC',
    });
  });

  afterAll(async () => {
    await deleteTestUser(testApp.app, author.id);
    await deleteTestUser(testApp.app, pilot.id);
    await deleteTestUser(testApp.app, other.id);
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

  async function likes(
    method: 'get' | 'put' | 'delete',
    user: TestUser | null,
    path: string,
    status = 200,
  ): Promise<LikesDto> {
    const call = request(testApp.server)[method](`${path}/likes`);
    const response = await (user ? call.set('Authorization', as(user)) : call).expect(
      status,
    );
    return response.body as LikesDto;
  }

  const postPath = (): string => `/api/posts/${post.id}`;

  it('a visitor sees the count but must sign in to like', async () => {
    expect(await likes('get', null, postPath())).toEqual({
      count: 0,
      likedByViewer: false,
    });
    await likes('put', null, postPath(), 401);
    await likes('delete', null, postPath(), 401);
  });

  it('a like counts once per pilot, however often it is sent', async () => {
    expect(await likes('put', pilot, postPath())).toEqual({
      count: 1,
      likedByViewer: true,
    });
    expect(await likes('put', pilot, postPath())).toEqual({
      count: 1,
      likedByViewer: true,
    });
    expect(await likes('put', other, postPath())).toEqual({
      count: 2,
      likedByViewer: true,
    });
    expect(await likes('get', null, postPath())).toEqual({
      count: 2,
      likedByViewer: false,
    });
  });

  it('the post and the blog carry the count, and whether the reader is among it', async () => {
    const forVisitor = (await request(testApp.server).get(postPath()).expect(200))
      .body as PostDto;
    expect(forVisitor.likes).toEqual({ count: 2, likedByViewer: false });

    const forPilot = (
      await request(testApp.server)
        .get(postPath())
        .set('Authorization', as(pilot))
        .expect(200)
    ).body as PostDto;
    expect(forPilot.likes).toEqual({ count: 2, likedByViewer: true });

    const blog = (await request(testApp.server).get('/api/posts/published').expect(200))
      .body as PostSummaryDto[];
    expect(blog.find((entry) => entry.id === post.id)?.likes.count).toBe(2);
  });

  it('taking a like back is idempotent too', async () => {
    expect(await likes('delete', pilot, postPath())).toEqual({
      count: 1,
      likedByViewer: false,
    });
    expect(await likes('delete', pilot, postPath())).toEqual({
      count: 1,
      likedByViewer: false,
    });
  });

  it('nobody likes or counts what they cannot open', async () => {
    await likes('put', pilot, `/api/posts/${draft.id}`, 404);
    await likes('get', null, `/api/posts/${draft.id}`, 404);
    expect(await likes('put', author, `/api/posts/${draft.id}`)).toEqual({
      count: 1,
      likedByViewer: true,
    });
  });

  it('builds are liked the same way, and their cards carry the count', async () => {
    const buildPath = `/api/builds/${build.id}`;
    expect(await likes('put', pilot, buildPath)).toEqual({
      count: 1,
      likedByViewer: true,
    });

    // Builds are behind sign-in, so the list another pilot browses is the shared one.
    const listed = (
      await request(testApp.server)
        .get('/api/builds/shared')
        .set('Authorization', as(other))
        .expect(200)
    ).body as BuildDto[];
    expect(listed.find((entry) => entry.id === build.id)?.likes).toEqual({
      count: 1,
      likedByViewer: false,
    });

    const own = (
      await request(testApp.server)
        .get(buildPath)
        .set('Authorization', as(pilot))
        .expect(200)
    ).body as BuildDto;
    expect(own.likes.likedByViewer).toBe(true);
  });

  it('deleting a post takes its likes with it', async () => {
    await request(testApp.server)
      .delete(postPath())
      .set('Authorization', as(author))
      .expect(204);
    expect(
      await testApp.app.get(PrismaService).like.count({ where: { postId: post.id } }),
    ).toBe(0);
  });

  it('a like belongs to exactly one post or build — the database refuses anything else', async () => {
    await expect(
      testApp.app.get(PrismaService).like.create({ data: { userId: pilot.id } }),
    ).rejects.toThrow();
  });
});

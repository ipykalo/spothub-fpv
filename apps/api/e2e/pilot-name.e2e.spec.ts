import type { BuildDto, CurrentUserDto, PilotNameDto, PostDto } from '@spothub/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/prisma';
import { type TestApp, createTestApp } from './support/app';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

/**
 * The full name Google gives is the pilot's and an admin's to see. Everyone
 * else — another pilot on a shared build, a visitor reading a post — sees the
 * name the pilot chose, or the first name and last initial.
 */
describe('pilot names', () => {
  let testApp: TestApp;
  let owner: TestUser;
  let reader: TestUser;
  let build: BuildDto;
  let post: PostDto;

  beforeAll(async () => {
    testApp = await createTestApp();
    owner = await createTestUser(testApp.app, 'name-owner');
    reader = await createTestUser(testApp.app, 'name-reader');

    // What a Google sign-in would have stored.
    await testApp.app
      .get(PrismaService)
      .user.update({ where: { id: owner.id }, data: { displayName: 'Ivan Pykalo' } });

    build = await send<BuildDto>(owner, 'post', '/api/builds', {
      name: 'Named five-inch',
      visibility: 'PUBLIC',
    });
    post = await send<PostDto>(owner, 'post', '/api/posts', {
      title: 'A post by a named pilot',
      body: 'Flew it today.',
      visibility: 'PUBLIC',
    });
  });

  afterAll(async () => {
    await deleteTestUser(testApp.app, owner.id);
    await deleteTestUser(testApp.app, reader.id);
    await testApp.close();
  });

  async function send<T>(
    user: TestUser | null,
    method: 'get' | 'post' | 'patch',
    path: string,
    body?: object,
    expected = method === 'post' ? 201 : 200,
  ): Promise<T> {
    let call = request(testApp.server)[method](path);

    if (user) {
      call = call.set('Authorization', `Bearer ${user.accessToken}`);
    }

    const response = await (body ? call.send(body) : call);
    expect(response.status, `${method.toUpperCase()} ${path}`).toBe(expected);
    return response.body as T;
  }

  it('shows others the first name and last initial until a pilot name is chosen', async () => {
    const opened = await send<BuildDto>(reader, 'get', `/api/builds/${build.id}`);
    expect(opened.ownerName).toBe('Ivan P.');

    const read = await send<PostDto>(null, 'get', `/api/posts/${post.id}`);
    expect(read.authorName).toBe('Ivan P.');

    const me = await send<CurrentUserDto>(owner, 'get', '/api/auth/me');
    expect(me).toMatchObject({
      displayName: 'Ivan Pykalo',
      pilotName: null,
      publicName: 'Ivan P.',
    });
  });

  it('shows the chosen name everywhere once set, and the short form again once cleared', async () => {
    const saved = await send<PilotNameDto>(owner, 'patch', '/api/users/me/name', {
      pilotName: '  Sky Ninja  ',
    });
    expect(saved).toEqual({ pilotName: 'Sky Ninja', publicName: 'Sky Ninja' });

    expect((await send<BuildDto>(reader, 'get', `/api/builds/${build.id}`)).ownerName).toBe(
      'Sky Ninja',
    );
    expect((await send<PostDto>(null, 'get', `/api/posts/${post.id}`)).authorName).toBe(
      'Sky Ninja',
    );

    const cleared = await send<PilotNameDto>(owner, 'patch', '/api/users/me/name', {
      pilotName: null,
    });
    expect(cleared).toEqual({ pilotName: null, publicName: 'Ivan P.' });
  });

  it('refuses a name that could pass for markup or a link', async () => {
    for (const pilotName of ['<b>x</b>', 'https://evil.example', 'x', 'a'.repeat(33)]) {
      await send(owner, 'patch', '/api/users/me/name', { pilotName }, 400);
    }
  });

  it('never gives anyone but the pilot the full name', async () => {
    const opened = await request(testApp.server)
      .get(`/api/builds/${build.id}`)
      .set('Authorization', `Bearer ${reader.accessToken}`);

    expect(JSON.stringify(opened.body)).not.toContain('Pykalo');

    const read = await request(testApp.server).get(`/api/posts/${post.id}`);
    expect(JSON.stringify(read.body)).not.toContain('Pykalo');
  });
});

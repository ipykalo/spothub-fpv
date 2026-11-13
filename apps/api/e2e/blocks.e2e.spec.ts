import type {
  BlockedPilotDto,
  BuildDto,
  ConversationDto,
  PostDto,
  SpotDto,
  UnreadCommentsDto,
} from '@spothub/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/prisma';
import { type TestApp, createTestApp } from './support/app';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

/**
 * One pilot blocks another: the blocked pilot can no longer comment on
 * anything the blocker owns, and the blocker no longer sees their comments —
 * everywhere else, nothing changes. Told as the blocker, the blocked pilot, a
 * bystander and a signed-out visitor. The tests run in order.
 */
describe('pilot blocks', () => {
  let testApp: TestApp;
  let owner: TestUser;
  let troll: TestUser;
  let bystander: TestUser;
  let admin: TestUser;
  let spot: SpotDto;
  let build: BuildDto;
  let post: PostDto;
  let elsewhere: SpotDto;

  beforeAll(async () => {
    testApp = await createTestApp();
    owner = await createTestUser(testApp.app, 'blocks-owner');
    troll = await createTestUser(testApp.app, 'blocks-troll');
    bystander = await createTestUser(testApp.app, 'blocks-bystander');
    admin = await createTestUser(testApp.app, 'blocks-admin');
    await testApp.app
      .get(PrismaService)
      .user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });

    spot = await send<SpotDto>(owner, 'post', '/api/spots', {
      name: 'Blocked field',
      lat: 49.6,
      lng: 11.6,
      visibility: 'PUBLIC',
    });
    build = await send<BuildDto>(owner, 'post', '/api/builds', {
      name: 'Blocked quad',
      visibility: 'PUBLIC',
    });
    post = await send<PostDto>(owner, 'post', '/api/posts', {
      title: 'Blocked post',
      visibility: 'PUBLIC',
    });
    elsewhere = await send<SpotDto>(bystander, 'post', '/api/spots', {
      name: 'Somebody else’s field',
      lat: 49.7,
      lng: 11.7,
      visibility: 'PUBLIC',
    });
  });

  afterAll(async () => {
    // By exact id; the last test has already deleted the troll.
    await testApp.app.get(PrismaService).user.deleteMany({
      where: { id: { in: [owner.id, troll.id, bystander.id, admin.id] } },
    });
    await testApp.close();
  });

  const as = (user: TestUser): string => `Bearer ${user.accessToken}`;

  async function send<T>(
    user: TestUser,
    method: 'post' | 'put' | 'delete',
    path: string,
    body?: object,
    status?: number,
  ): Promise<T> {
    const call = request(testApp.server)[method](path).set('Authorization', as(user));
    const response = await (body ? call.send(body) : call).expect(
      status ?? (method === 'post' ? 201 : 204),
    );
    return response.body as T;
  }

  async function get<T>(user: TestUser | null, path: string, status = 200): Promise<T> {
    const call = request(testApp.server).get(path);
    const response = await (user ? call.set('Authorization', as(user)) : call).expect(
      status,
    );
    return response.body as T;
  }

  const comments = (kind: 'spots' | 'builds' | 'posts', id: string): string =>
    `/api/${kind}/${id}/comments`;

  let trollQuestion: string;
  let trollPostComment: string;

  it('nobody blocks themselves, an admin, or a pilot who is not there', async () => {
    await send(owner, 'put', `/api/users/blocks/${owner.id}`, undefined, 400);
    await send(owner, 'put', `/api/users/blocks/${admin.id}`, undefined, 400);
    await send(
      owner,
      'put',
      '/api/users/blocks/00000000-0000-4000-8000-000000000000',
      undefined,
      404,
    );
    await request(testApp.server).put(`/api/users/blocks/${troll.id}`).expect(401);
    await get(null, '/api/users/me/blocks', 401);
  });

  it('blocking is idempotent and lists the pilot by their public name', async () => {
    // Said before the block: a question with a bystander's reply, and a lone comment.
    const asked = await send<ConversationDto>(troll, 'post', comments('spots', spot.id), {
      body: 'Ugly field',
    });
    trollQuestion = asked.questions[0].id;
    await send(bystander, 'post', comments('spots', spot.id), {
      body: 'Looks fine to me',
      parentId: trollQuestion,
    });
    const said = await send<ConversationDto>(troll, 'post', comments('posts', post.id), {
      body: 'Boring post',
    });
    trollPostComment = said.questions[0].id;

    await send(owner, 'put', `/api/users/blocks/${troll.id}`);
    await send(owner, 'put', `/api/users/blocks/${troll.id}`);

    const blocked = await get<BlockedPilotDto[]>(owner, '/api/users/me/blocks');
    expect(blocked).toHaveLength(1);
    expect(blocked[0].userId).toBe(troll.id);
    expect(blocked[0].name).toBeTruthy();
    expect(JSON.stringify(blocked)).not.toContain('@');

    // A block list is its own pilot's: the troll's is empty.
    expect(await get<BlockedPilotDto[]>(troll, '/api/users/me/blocks')).toEqual([]);
  });

  it('the blocked pilot meets commenting closed on everything the blocker owns', async () => {
    for (const [kind, id] of [
      ['spots', spot.id],
      ['builds', build.id],
      ['posts', post.id],
    ] as const) {
      const refused = await request(testApp.server)
        .post(comments(kind, id))
        .set('Authorization', as(troll))
        .send({ body: 'Still here' })
        .expect(403);
      expect(JSON.stringify(refused.body)).toContain('Comments are closed here');
      expect(JSON.stringify(refused.body).toLowerCase()).not.toContain('block');
    }

    // A reply is a comment too.
    await send(
      troll,
      'post',
      comments('spots', spot.id),
      { body: 'Still ugly', parentId: trollQuestion },
      403,
    );

    // Somebody else's spot is open to them as before.
    await send(troll, 'post', comments('spots', elsewhere.id), { body: 'Nice field' });
  });

  it('the blocker no longer sees what the blocked pilot wrote; nobody else is affected', async () => {
    const seenByOwner = await get<ConversationDto>(owner, comments('spots', spot.id));
    const placeholder = seenByOwner.questions.find((q) => q.id === trollQuestion);
    expect(placeholder).toMatchObject({
      blocked: true,
      body: '',
      authorName: null,
      authorId: null,
    });
    expect(placeholder?.replies.map((r) => r.body)).toEqual(['Looks fine to me']);

    const ownersPost = await get<ConversationDto>(owner, comments('posts', post.id));
    expect(ownersPost.questions.some((q) => q.id === trollPostComment)).toBe(false);

    const seenByBystander = await get<ConversationDto>(
      bystander,
      comments('spots', spot.id),
    );
    expect(seenByBystander.questions.find((q) => q.id === trollQuestion)).toMatchObject({
      blocked: false,
      body: 'Ugly field',
      authorId: troll.id,
    });

    // A signed-out visitor is told nobody's id.
    const visitor = await get<ConversationDto>(null, comments('posts', post.id));
    const visible = visitor.questions.find((q) => q.id === trollPostComment);
    expect(visible).toMatchObject({ body: 'Boring post', authorId: null });

    // Nor are they counted as unread: on the spot, only the bystander's reply.
    const unread = await get<UnreadCommentsDto>(owner, '/api/comments/unread');
    expect(unread.spots.bySubject[spot.id]).toBe(1);
    expect(unread.posts.bySubject[post.id]).toBeUndefined();
  });

  it('unblocking restores both', async () => {
    await send(owner, 'delete', `/api/users/blocks/${troll.id}`);
    await send(owner, 'delete', `/api/users/blocks/${troll.id}`);
    expect(await get<BlockedPilotDto[]>(owner, '/api/users/me/blocks')).toEqual([]);

    await send(troll, 'post', comments('builds', build.id), { body: 'Nice quad' });

    const seen = await get<ConversationDto>(owner, comments('posts', post.id));
    expect(seen.questions.find((q) => q.id === trollPostComment)).toMatchObject({
      blocked: false,
      body: 'Boring post',
    });
  });

  it('a block goes with either pilot', async () => {
    const prisma = testApp.app.get(PrismaService);
    await send(bystander, 'put', `/api/users/blocks/${troll.id}`);
    await deleteTestUser(testApp.app, troll.id);

    expect(await prisma.pilotBlock.count({ where: { blockedId: troll.id } })).toBe(0);
    expect(await get<BlockedPilotDto[]>(bystander, '/api/users/me/blocks')).toEqual([]);
  });
});

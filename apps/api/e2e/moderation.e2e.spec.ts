import type {
  AdminUserDto,
  ConversationDto,
  HiddenCommentDto,
  HiddenCountDto,
  HiddenPostDto,
  PostDto,
  PostSummaryDto,
} from '@spothub/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/prisma';
import { type TestApp, createTestApp } from './support/app';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

/**
 * An admin hides or deletes any post or comment, and hides every post a pilot
 * wrote at once — as an author, a reader, an admin and a signed-out visitor.
 * Hidden is read by a post's author alone; everyone else meets "not found",
 * exactly as for a draft. The tests run in order.
 */
describe('moderation', () => {
  let testApp: TestApp;
  let author: TestUser;
  let reader: TestUser;
  let admin: TestUser;
  let post: PostDto;
  let second: PostDto;

  beforeAll(async () => {
    testApp = await createTestApp();
    author = await createTestUser(testApp.app, 'moderation-author');
    reader = await createTestUser(testApp.app, 'moderation-reader');
    admin = await createTestUser(testApp.app, 'moderation-admin');
    await testApp.app
      .get(PrismaService)
      .user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });

    post = await send<PostDto>(author, 'post', '/api/posts', {
      title: 'Cheap props here',
      visibility: 'PUBLIC',
    });
    second = await send<PostDto>(author, 'post', '/api/posts', {
      title: 'More cheap props',
      visibility: 'PUBLIC',
    });
  });

  afterAll(async () => {
    for (const user of [author, reader, admin]) {
      await deleteTestUser(testApp.app, user.id);
    }
    await testApp.close();
  });

  const as = (user: TestUser): string => `Bearer ${user.accessToken}`;

  async function send<T>(
    user: TestUser,
    method: 'post' | 'patch' | 'delete',
    path: string,
    body?: object,
    status?: number,
  ): Promise<T> {
    const call = request(testApp.server)[method](path).set('Authorization', as(user));
    const response = await (body ? call.send(body) : call).expect(
      status ?? (method === 'post' ? 201 : 200),
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

  const comments = (user: TestUser | null, postId = post.id): Promise<ConversationDto> =>
    get<ConversationDto>(user, `/api/posts/${postId}/comments`);

  const published = async (): Promise<string[]> =>
    (await get<PostSummaryDto[]>(null, '/api/posts/published')).map((p) => p.id);

  it('only an admin moderates', async () => {
    await send(reader, 'patch', `/api/admin/posts/${post.id}`, { hidden: true }, 403);
    await send(reader, 'delete', `/api/admin/posts/${post.id}`, undefined, 403);
    await send(
      author,
      'patch',
      `/api/admin/users/${author.id}/posts`,
      { hidden: true },
      403,
    );
    await get(reader, '/api/admin/posts/hidden', 403);
    await get(reader, '/api/admin/comments/hidden', 403);
    await send(
      reader,
      'patch',
      '/api/admin/comments/00000000-0000-4000-8000-000000000000',
      { hidden: true },
      403,
    );
  });

  it('a hidden post is its author’s alone, whatever its visibility says', async () => {
    await send(admin, 'patch', `/api/admin/posts/${post.id}`, { hidden: true }, 204);

    await get(null, `/api/posts/${post.id}`, 404);
    await get(reader, `/api/posts/${post.id}`, 404);
    await get(null, `/api/posts/${post.id}/comments`, 404);
    await get(reader, `/api/posts/${post.id}/likes`, 404);
    expect(await published()).not.toContain(post.id);

    const own = await get<PostDto>(author, `/api/posts/${post.id}`);
    expect(own.hidden).toBe(true);

    // Choosing a visibility again does not bring it back.
    await send(author, 'patch', `/api/posts/${post.id}`, { visibility: 'PUBLIC' });
    await get(reader, `/api/posts/${post.id}`, 404);

    const hidden = await get<HiddenPostDto[]>(admin, '/api/admin/posts/hidden');
    expect(hidden.find((p) => p.id === post.id)).toMatchObject({
      title: 'Cheap props here',
      slug: post.slug,
    });
  });

  it('showing a post again opens it to everyone', async () => {
    await send(admin, 'patch', `/api/admin/posts/${post.id}`, { hidden: false }, 204);

    expect((await get<PostDto>(null, `/api/posts/${post.id}`)).hidden).toBe(false);
    expect(await published()).toContain(post.id);
    const hidden = await get<HiddenPostDto[]>(admin, '/api/admin/posts/hidden');
    expect(hidden.some((p) => p.id === post.id)).toBe(false);
  });

  it('a hidden comment leaves the conversation, and a hidden question with replies stays as a placeholder', async () => {
    const asked = await send<ConversationDto>(
      author,
      'post',
      `/api/posts/${post.id}/comments`,
      {
        body: 'Visit my shop',
      },
    );
    const spamId = asked.questions[0].id;
    const withReply = await send<ConversationDto>(
      reader,
      'post',
      `/api/posts/${post.id}/comments`,
      { body: 'Which props?' },
    );
    const questionId = withReply.questions[0].id;
    await send(author, 'post', `/api/posts/${post.id}/comments`, {
      body: 'Gemfan',
      parentId: questionId,
    });

    await send(admin, 'patch', `/api/admin/comments/${spamId}`, { hidden: true }, 204);
    await send(
      admin,
      'patch',
      `/api/admin/comments/${questionId}`,
      { hidden: true },
      204,
    );

    for (const viewer of [null, reader, author, admin]) {
      const conversation = await comments(viewer);
      expect(conversation.questions.some((q) => q.id === spamId)).toBe(false);

      const placeholder = conversation.questions.find((q) => q.id === questionId);
      expect(placeholder).toMatchObject({ hidden: true, body: '', authorName: null });
      expect(placeholder?.replies.map((r) => r.body)).toEqual(['Gemfan']);
    }

    // Not counted, not rewordable, no new replies, not reportable.
    expect((await get<PostDto>(null, `/api/posts/${post.id}`)).commentCount).toBe(1);
    await send(
      author,
      'patch',
      `/api/posts/${post.id}/comments/${spamId}`,
      { body: 'Visit my other shop' },
      404,
    );
    await send(
      author,
      'post',
      `/api/posts/${post.id}/comments`,
      { body: 'More', parentId: questionId },
      400,
    );
    await send(
      admin,
      'post',
      '/api/reports',
      { subject: 'COMMENT', subjectId: spamId, reason: 'SPAM' },
      404,
    );

    const hidden = await get<HiddenCommentDto[]>(admin, '/api/admin/comments/hidden');
    expect(hidden.find((c) => c.id === spamId)).toMatchObject({
      excerpt: 'Visit my shop',
      place: { kind: 'POST', id: post.id, slug: post.slug },
    });
    expect(JSON.stringify(hidden)).not.toContain('@');

    // Shown again, it is back as it was.
    await send(
      admin,
      'patch',
      `/api/admin/comments/${questionId}`,
      { hidden: false },
      204,
    );
    expect(
      (await comments(reader)).questions.find((q) => q.id === questionId),
    ).toMatchObject({ hidden: false, body: 'Which props?' });
  });

  it('an admin deletes any comment, its replies with it', async () => {
    const before = await comments(admin);
    const question = before.questions.find((q) => q.body === 'Which props?');
    expect(question?.replies).toHaveLength(1);

    await send(
      admin,
      'delete',
      `/api/admin/comments/${question?.id ?? ''}`,
      undefined,
      204,
    );
    await send(
      admin,
      'delete',
      `/api/admin/comments/${question?.id ?? ''}`,
      undefined,
      404,
    );

    const after = await comments(reader);
    expect(after.questions.some((q) => q.id === question?.id)).toBe(false);
  });

  it('an admin hides every post a pilot wrote at once, and shows them again', async () => {
    const hid = await send<HiddenCountDto>(
      admin,
      'patch',
      `/api/admin/users/${author.id}/posts`,
      {
        hidden: true,
      },
    );
    expect(hid.count).toBe(2);

    const ids = await published();
    expect(ids).not.toContain(post.id);
    expect(ids).not.toContain(second.id);

    const pilots = await get<AdminUserDto[]>(admin, '/api/admin/users');
    expect(pilots.find((u) => u.id === author.id)).toMatchObject({
      postCount: 2,
      hiddenPostCount: 2,
    });
    expect(pilots.find((u) => u.id === reader.id)).toMatchObject({
      postCount: 0,
      hiddenPostCount: 0,
    });

    // Already hidden: nothing changes.
    const again = await send<HiddenCountDto>(
      admin,
      'patch',
      `/api/admin/users/${author.id}/posts`,
      { hidden: true },
    );
    expect(again.count).toBe(0);

    const shown = await send<HiddenCountDto>(
      admin,
      'patch',
      `/api/admin/users/${author.id}/posts`,
      { hidden: false },
    );
    expect(shown.count).toBe(2);
    expect(await published()).toContain(second.id);
  });

  it('an admin deletes any post', async () => {
    await send(admin, 'delete', `/api/admin/posts/${second.id}`, undefined, 204);
    await send(admin, 'delete', `/api/admin/posts/${second.id}`, undefined, 404);
    await get(author, `/api/posts/${second.id}`, 404);
    await send(admin, 'patch', `/api/admin/posts/${second.id}`, { hidden: true }, 404);
  });

  it('an author’s own rules are untouched', async () => {
    // Still their post to edit and delete; still nobody else's.
    await send(author, 'patch', `/api/posts/${post.id}`, { title: 'Props' });
    await send(reader, 'delete', `/api/posts/${post.id}`, undefined, 404);
    await send(author, 'delete', `/api/posts/${post.id}`, undefined, 204);
  });
});

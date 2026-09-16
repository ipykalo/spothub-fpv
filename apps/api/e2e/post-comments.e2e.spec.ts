import type {
  BuildDto,
  ConversationDto,
  PostDto,
  PostSummaryDto,
  UnreadCommentsDto,
} from '@spothub/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/prisma';
import { type TestApp, createTestApp } from './support/app';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

/**
 * Comments under blog posts, as the author, two pilots and a signed-out
 * visitor. The same conversation as on spots and builds — top-level comments
 * with replies one level deep — without an answer to mark. The tests run in
 * order on the same post.
 */
describe('comments on posts', () => {
  let testApp: TestApp;
  let author: TestUser;
  let pilot: TestUser;
  let other: TestUser;
  let post: PostDto;
  let draft: PostDto;
  let build: BuildDto;

  beforeAll(async () => {
    testApp = await createTestApp();
    author = await createTestUser(testApp.app, 'post-comments-author');
    pilot = await createTestUser(testApp.app, 'post-comments-pilot');
    other = await createTestUser(testApp.app, 'post-comments-other');

    post = await send<PostDto>(author, 'post', '/api/posts', {
      title: 'A post to talk about',
      visibility: 'PUBLIC',
    });
    draft = await send<PostDto>(author, 'post', '/api/posts', { title: 'Not out yet' });
    build = await send<BuildDto>(author, 'post', '/api/builds', {
      name: 'Talked-about quad',
    });
  });

  afterAll(async () => {
    await deleteTestUser(testApp.app, author.id);
    await deleteTestUser(testApp.app, pilot.id);
    await deleteTestUser(testApp.app, other.id);
    await testApp.close();
  });

  async function send<T>(
    user: TestUser | null,
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    body?: object,
    status?: number,
  ): Promise<T> {
    let call = request(testApp.server)[method](path);

    if (user) {
      call = call.set('Authorization', `Bearer ${user.accessToken}`);
    }

    const response = await (body ? call.send(body) : call);

    if (status !== undefined) {
      expect(response.status).toBe(status);
    } else {
      expect(response.status).toBeLessThan(300);
    }

    return response.body as T;
  }

  const comments = (): string => `/api/posts/${post.id}/comments`;

  it('a visitor reads the comments but must sign in to write one', async () => {
    const conversation = await send<ConversationDto>(null, 'get', comments());
    expect(conversation).toEqual({ questions: [], viewerOwnsSubject: false });

    await send(null, 'post', comments(), { body: 'Hello?' }, 401);
  });

  it('pilots comment, the author replies and is shown as the author', async () => {
    let conversation = await send<ConversationDto>(pilot, 'post', comments(), {
      body: 'What props are those?',
    });
    const [comment] = conversation.questions;
    expect(comment.byViewer).toBe(true);

    conversation = await send<ConversationDto>(author, 'post', comments(), {
      body: 'Gemfan 51466.',
      parentId: comment.id,
    });
    expect(conversation.viewerOwnsSubject).toBe(true);
    expect(conversation.questions[0].replies[0].byOwner).toBe(true);

    const forVisitor = await send<ConversationDto>(null, 'get', comments());
    expect(forVisitor.questions).toHaveLength(1);
    expect(forVisitor.questions[0].replies).toHaveLength(1);
    expect(forVisitor.questions[0].canDelete).toBe(false);
  });

  it('a reply under a post is never marked as an answer', async () => {
    const conversation = await send<ConversationDto>(pilot, 'get', comments());
    const reply = conversation.questions[0].replies[0];
    expect(reply.canMarkAnswer).toBe(false);

    await send(pilot, 'put', `${comments()}/${reply.id}/answer`, { isAnswer: true }, 404);
  });

  it('the blog row counts comments and replies', async () => {
    const blog = await send<PostSummaryDto[]>(null, 'get', '/api/posts/published');
    expect(blog.find((entry) => entry.id === post.id)?.commentCount).toBe(2);
  });

  it("counts other pilots' comments as unread for the author until they read them", async () => {
    const unread = async (): Promise<number> =>
      (await send<UnreadCommentsDto>(author, 'get', '/api/comments/unread')).posts
        .bySubject[post.id] ?? 0;

    // The pilot's comment; the author's own reply is not news to them.
    expect(await unread()).toBe(1);

    await send(author, 'post', `${comments()}/read`, {}, 204);
    expect(await unread()).toBe(0);
  });

  it('the author deletes any comment under their post', async () => {
    const conversation = await send<ConversationDto>(other, 'post', comments(), {
      body: 'Nice one.',
    });
    const mine = conversation.questions.find((entry) => entry.byViewer);

    const afterDelete = await send<ConversationDto>(
      author,
      'delete',
      `${comments()}/${mine?.id ?? ''}`,
    );
    expect(afterDelete.questions.some((entry) => entry.id === mine?.id)).toBe(false);
  });

  it('nobody comments on a draft but its author', async () => {
    const draftComments = `/api/posts/${draft.id}/comments`;

    await send(pilot, 'post', draftComments, { body: 'Early look?' }, 404);
    await send(null, 'get', draftComments, undefined, 404);
    await send(author, 'post', draftComments, { body: 'Note to self.' }, 201);
  });

  it('deleting the post takes its comments with it', async () => {
    await send(author, 'delete', `/api/posts/${post.id}`, undefined, 204);

    const prisma = testApp.app.get(PrismaService);
    expect(await prisma.comment.count({ where: { postId: post.id } })).toBe(0);
  });

  it('a comment belongs to exactly one post, build or spot — the database refuses two', async () => {
    const prisma = testApp.app.get(PrismaService);

    await expect(
      prisma.comment.create({
        data: { authorId: author.id, body: 'Both?', postId: draft.id, buildId: build.id },
      }),
    ).rejects.toThrow();
  });
});

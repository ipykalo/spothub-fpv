import type { BuildDto, ConversationDto, PostDto, ReportDto } from '@spothub/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/prisma';
import { type TestApp, createTestApp } from './support/app';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

/**
 * Reports on posts and comments, as their author, a pilot who reports, a
 * second reporter, an admin and a signed-out visitor: who may report what,
 * that a report reaches the admin with what it is about, and that closing one
 * closes every open report about the same thing. The tests run in order.
 */
describe('reports', () => {
  let testApp: TestApp;
  let author: TestUser;
  let pilot: TestUser;
  let other: TestUser;
  let admin: TestUser;
  let post: PostDto;
  let draft: PostDto;
  let build: BuildDto;
  let postCommentId: string;
  let buildCommentId: string;

  beforeAll(async () => {
    testApp = await createTestApp();
    author = await createTestUser(testApp.app, 'reports-author');
    pilot = await createTestUser(testApp.app, 'reports-pilot');
    other = await createTestUser(testApp.app, 'reports-other');
    admin = await createTestUser(testApp.app, 'reports-admin');
    await testApp.app
      .get(PrismaService)
      .user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });

    post = await postAs<PostDto>(author, '/api/posts', {
      title: 'Reported post',
      visibility: 'PUBLIC',
    });
    draft = await postAs<PostDto>(author, '/api/posts', { title: 'Unseen draft' });
    build = await postAs<BuildDto>(author, '/api/builds', {
      name: 'Reported build',
      visibility: 'PUBLIC',
    });

    const onPost = await postAs<ConversationDto>(
      author,
      `/api/posts/${post.id}/comments`,
      { body: 'Buy cheap props at example.com' },
    );
    postCommentId = onPost.questions[0].id;
    const onBuild = await postAs<ConversationDto>(
      author,
      `/api/builds/${build.id}/comments`,
      { body: 'Rude words' },
    );
    buildCommentId = onBuild.questions[0].id;
  });

  afterAll(async () => {
    for (const user of [author, pilot, other, admin]) {
      await deleteTestUser(testApp.app, user.id);
    }
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

  function report(user: TestUser | null, body: object, status = 204): Promise<unknown> {
    const call = request(testApp.server).post('/api/reports').send(body);
    return (user ? call.set('Authorization', as(user)) : call).expect(status);
  }

  async function openReports(user: TestUser, status = 200): Promise<ReportDto[]> {
    const response = await request(testApp.server)
      .get('/api/admin/reports')
      .set('Authorization', as(user))
      .expect(status);
    return response.body as ReportDto[];
  }

  it('a visitor must sign in to report', async () => {
    await report(null, { subject: 'POST', subjectId: post.id, reason: 'SPAM' }, 401);
  });

  it('refuses what the reporter cannot see, their own words, and an unexplained "something else"', async () => {
    await report(pilot, { subject: 'POST', subjectId: draft.id, reason: 'SPAM' }, 404);
    await report(
      pilot,
      {
        subject: 'COMMENT',
        subjectId: '00000000-0000-4000-8000-000000000000',
        reason: 'SPAM',
      },
      404,
    );
    await report(author, { subject: 'POST', subjectId: post.id, reason: 'SPAM' }, 400);
    await report(
      author,
      { subject: 'COMMENT', subjectId: postCommentId, reason: 'SPAM' },
      400,
    );
    await report(pilot, { subject: 'POST', subjectId: post.id, reason: 'OTHER' }, 400);
    await report(
      pilot,
      { subject: 'POST', subjectId: post.id, reason: 'OTHER', details: '   ' },
      400,
    );
  });

  it('a pilot reports a post and comments on a post and a build', async () => {
    await report(pilot, { subject: 'POST', subjectId: post.id, reason: 'SPAM' });
    await report(pilot, {
      subject: 'COMMENT',
      subjectId: postCommentId,
      reason: 'SPAM',
      details: 'An advert',
    });
    await report(other, {
      subject: 'COMMENT',
      subjectId: postCommentId,
      reason: 'ABUSE',
    });
    await report(other, {
      subject: 'COMMENT',
      subjectId: buildCommentId,
      reason: 'ABUSE',
    });
  });

  it('reporting again replaces the reason rather than adding a report', async () => {
    await report(pilot, { subject: 'POST', subjectId: post.id, reason: 'ILLEGAL' });

    const onPost = (await openReports(admin)).filter((r) => r.place.id === post.id);
    expect(onPost.filter((r) => r.subject === 'POST')).toHaveLength(1);
    expect(onPost.find((r) => r.subject === 'POST')?.reason).toBe('ILLEGAL');
  });

  it('only an admin reads reports', async () => {
    await openReports(pilot, 403);
    await openReports(author, 403);
  });

  it('an admin reads what each report is about and where it is', async () => {
    const reports = await openReports(admin);
    const mine = reports.filter((r) => r.place.id === post.id || r.place.id === build.id);

    expect(mine).toHaveLength(4);
    expect(mine.find((r) => r.subject === 'POST')).toMatchObject({
      excerpt: 'Reported post',
      place: { kind: 'POST', id: post.id, slug: post.slug },
    });
    expect(mine.find((r) => r.details === 'An advert')).toMatchObject({
      subject: 'COMMENT',
      reason: 'SPAM',
      excerpt: 'Buy cheap props at example.com',
      place: { kind: 'POST', id: post.id, slug: post.slug },
    });
    expect(mine.find((r) => r.place.kind === 'BUILD')).toMatchObject({
      subject: 'COMMENT',
      excerpt: 'Rude words',
      place: { kind: 'BUILD', id: build.id, slug: null },
    });

    // Names are public names, never an email.
    for (const entry of mine) {
      expect(JSON.stringify(entry)).not.toContain('@');
    }
  });

  it('closing a report closes every open one about the same comment, and nothing else', async () => {
    const before = await openReports(admin);
    const aboutComment = before.filter(
      (r) => r.subject === 'COMMENT' && r.excerpt.startsWith('Buy cheap'),
    );
    expect(aboutComment).toHaveLength(2);

    await request(testApp.server)
      .patch(`/api/admin/reports/${aboutComment[0].id}`)
      .set('Authorization', as(pilot))
      .send({ resolved: true })
      .expect(403);

    const response = await request(testApp.server)
      .patch(`/api/admin/reports/${aboutComment[0].id}`)
      .set('Authorization', as(admin))
      .send({ resolved: true })
      .expect(200);
    const left = response.body as ReportDto[];

    expect(left.some((r) => r.excerpt.startsWith('Buy cheap'))).toBe(false);
    expect(left.some((r) => r.excerpt === 'Rude words')).toBe(true);
    expect(left.some((r) => r.excerpt === 'Reported post')).toBe(true);

    // Already closed.
    await request(testApp.server)
      .patch(`/api/admin/reports/${aboutComment[0].id}`)
      .set('Authorization', as(admin))
      .send({ resolved: true })
      .expect(404);
  });

  it('reporting a closed one again opens it again', async () => {
    await report(pilot, { subject: 'COMMENT', subjectId: postCommentId, reason: 'SPAM' });

    const reopened = (await openReports(admin)).filter((r) =>
      r.excerpt.startsWith('Buy cheap'),
    );
    expect(reopened).toHaveLength(1);
    expect(reopened[0].details).toBeNull();
  });

  it('a report goes with what it is about', async () => {
    await request(testApp.server)
      .delete(`/api/posts/${post.id}`)
      .set('Authorization', as(author))
      .expect(204);

    const left = await openReports(admin);
    expect(left.some((r) => r.place.id === post.id)).toBe(false);
    expect(left.some((r) => r.place.id === build.id)).toBe(true);
  });
});

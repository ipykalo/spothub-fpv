import type {
  SpotCommentDto,
  SpotCommentsDto,
  SpotDto,
  SpotQuestionDto,
  UnreadSpotCommentsDto,
} from '@spothub/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/prisma';
import { type TestApp, createTestApp } from './support/app';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

/**
 * Questions and replies on spots, driven through the real routes as two
 * people: the spot's owner and another pilot. The tests run in order and
 * build one conversation, because the rules are about who did what to whose
 * words.
 */
describe('spot comments', () => {
  let testApp: TestApp;
  let owner: TestUser;
  let pilot: TestUser;
  let publicSpot: SpotDto;
  let privateSpot: SpotDto;

  let question: SpotQuestionDto;
  let firstReply: SpotCommentDto;
  let secondReply: SpotCommentDto;

  beforeAll(async () => {
    testApp = await createTestApp();
    owner = await createTestUser(testApp.app, 'comments-owner');
    pilot = await createTestUser(testApp.app, 'comments-pilot');

    publicSpot = await createSpot({ name: 'Talked-about field', lat: 49.4, lng: 11.4, visibility: 'PUBLIC' });
    privateSpot = await createSpot({ name: 'Secret field', lat: 49.5, lng: 11.5 });
  });

  afterAll(async () => {
    await deleteTestUser(testApp.app, owner.id);
    await deleteTestUser(testApp.app, pilot.id);
    await testApp.close();
  });

  const as = (user: TestUser): string => `Bearer ${user.accessToken}`;

  async function createSpot(body: object): Promise<SpotDto> {
    const response = await request(testApp.server)
      .post('/api/spots')
      .set('Authorization', as(owner))
      .send(body)
      .expect(201);

    return response.body as SpotDto;
  }

  const comments = (spotId: string): string => `/api/spots/${spotId}/comments`;

  const post = (user: TestUser, spotId: string, body: object): request.Test =>
    request(testApp.server).post(comments(spotId)).set('Authorization', as(user)).send(body);

  async function unreadFor(user: TestUser): Promise<UnreadSpotCommentsDto> {
    const response = await request(testApp.server)
      .get('/api/spot-comments/unread')
      .set('Authorization', as(user))
      .expect(200);

    return response.body as UnreadSpotCommentsDto;
  }

  it('nobody can read or ask about a spot they cannot open', async () => {
    await request(testApp.server)
      .get(comments(privateSpot.id))
      .set('Authorization', as(pilot))
      .expect(404);

    await post(pilot, privateSpot.id, { body: 'Can I fly here?' }).expect(404);
  });

  it('a pilot asks on a shared spot, and sees the question as theirs', async () => {
    const thread = (await post(pilot, publicSpot.id, { body: '  Is parking free?  ' }).expect(201))
      .body as SpotCommentsDto;

    expect(thread.viewerOwnsSpot).toBe(false);
    expect(thread.questions).toHaveLength(1);

    question = thread.questions[0];
    expect(question.body).toBe('Is parking free?');
    expect(question).toMatchObject({ byViewer: true, byOwner: false, canDelete: true, answered: false });
  });

  it('the owner replies, and may moderate the pilot’s question', async () => {
    const thread = (
      await post(owner, publicSpot.id, { body: 'Yes, by the gate', parentId: question.id }).expect(201)
    ).body as SpotCommentsDto;

    expect(thread.viewerOwnsSpot).toBe(true);

    const asked = thread.questions[0];
    expect(asked).toMatchObject({ byViewer: false, canDelete: true });

    firstReply = asked.replies[0];
    expect(firstReply).toMatchObject({ byOwner: true, byViewer: true, isAnswer: false });
  });

  it('replies go one level deep', async () => {
    await post(pilot, publicSpot.id, { body: 'Thanks!', parentId: firstReply.id }).expect(400);
  });

  it('refuses an empty or overlong comment', async () => {
    await post(pilot, publicSpot.id, { body: '   ' }).expect(400);
    await post(pilot, publicSpot.id, { body: 'x'.repeat(2001) }).expect(400);
  });

  it('only the author can reword a comment', async () => {
    await request(testApp.server)
      .patch(`${comments(publicSpot.id)}/${firstReply.id}`)
      .set('Authorization', as(pilot))
      .send({ body: 'No, it costs 5 EUR' })
      .expect(404);

    const thread = (
      await request(testApp.server)
        .patch(`${comments(publicSpot.id)}/${question.id}`)
        .set('Authorization', as(pilot))
        .send({ body: 'Is parking free at weekends?' })
        .expect(200)
    ).body as SpotCommentsDto;

    expect(thread.questions[0].body).toBe('Is parking free at weekends?');
    expect(thread.questions[0].editedAt).not.toBeNull();
  });

  it('the owner marks one reply as the answer, and nobody else can', async () => {
    const added = (
      await post(pilot, publicSpot.id, { body: 'Any shelter from the wind?', parentId: question.id }).expect(201)
    ).body as SpotCommentsDto;
    secondReply = added.questions[0].replies[1];

    const answer = (user: TestUser, commentId: string): request.Test =>
      request(testApp.server)
        .put(`${comments(publicSpot.id)}/${commentId}/answer`)
        .set('Authorization', as(user))
        .send({ isAnswer: true });

    await answer(pilot, firstReply.id).expect(404);
    // A question is not an answer to anything.
    await answer(owner, question.id).expect(404);

    let thread = (await answer(owner, firstReply.id).expect(200)).body as SpotCommentsDto;
    expect(thread.questions[0].answered).toBe(true);

    thread = (await answer(owner, secondReply.id).expect(200)).body as SpotCommentsDto;
    expect(thread.questions[0].replies.map((reply) => reply.isAnswer)).toEqual([false, true]);
  });

  it("counts other people's comments as unread for the owner, until the owner reads them", async () => {
    // The pilot's question and second reply; the owner's own reply never counts.
    let unread = await unreadFor(owner);
    expect(unread.bySpot[publicSpot.id]).toBe(2);
    expect(unread.total).toBe(2);

    await request(testApp.server)
      .post(`${comments(publicSpot.id)}/read`)
      .set('Authorization', as(owner))
      .expect(204);

    unread = await unreadFor(owner);
    expect(unread.bySpot[publicSpot.id]).toBeUndefined();
    expect(unread.total).toBe(0);

    // Clear of the read marker's millisecond, so "after" is unambiguous.
    await new Promise((resolve) => setTimeout(resolve, 10));
    await post(pilot, publicSpot.id, { body: 'One more thing' }).expect(201);

    expect((await unreadFor(owner)).bySpot[publicSpot.id]).toBe(1);
    // Nothing waits for the pilot: it is not their spot.
    expect((await unreadFor(pilot)).total).toBe(0);
  });

  it("a pilot cannot delete the owner's reply; the owner deletes the pilot's question, replies and all", async () => {
    await request(testApp.server)
      .delete(`${comments(publicSpot.id)}/${firstReply.id}`)
      .set('Authorization', as(pilot))
      .expect(404);

    const thread = (
      await request(testApp.server)
        .delete(`${comments(publicSpot.id)}/${question.id}`)
        .set('Authorization', as(owner))
        .expect(200)
    ).body as SpotCommentsDto;

    expect(thread.questions.map((entry) => entry.id)).not.toContain(question.id);

    const orphans = await testApp.app
      .get(PrismaService)
      .spotComment.count({ where: { parentId: question.id } });
    expect(orphans).toBe(0);
  });

  it('making the spot private again closes its conversation to everyone else', async () => {
    await request(testApp.server)
      .patch(`/api/spots/${publicSpot.id}`)
      .set('Authorization', as(owner))
      .send({ visibility: 'PRIVATE' })
      .expect(200);

    await request(testApp.server)
      .get(comments(publicSpot.id))
      .set('Authorization', as(pilot))
      .expect(404);

    await request(testApp.server)
      .get(comments(publicSpot.id))
      .set('Authorization', as(owner))
      .expect(200);
  });
});

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
 * Questions and replies on spots, driven through the real routes as three
 * people: the spot's owner, the pilot who asks, and a bystander who can also
 * open the spot. The tests run in order and build one conversation, because
 * the rules are about who did what to whose words.
 */
describe('spot comments', () => {
  let testApp: TestApp;
  let owner: TestUser;
  let pilot: TestUser;
  let bystander: TestUser;
  let publicSpot: SpotDto;
  let privateSpot: SpotDto;

  let question: SpotQuestionDto;
  let ownerReply: SpotCommentDto;

  beforeAll(async () => {
    testApp = await createTestApp();
    owner = await createTestUser(testApp.app, 'comments-owner');
    pilot = await createTestUser(testApp.app, 'comments-pilot');
    bystander = await createTestUser(testApp.app, 'comments-bystander');

    publicSpot = await createSpot({ name: 'Talked-about field', lat: 49.4, lng: 11.4, visibility: 'PUBLIC' });
    privateSpot = await createSpot({ name: 'Secret field', lat: 49.5, lng: 11.5 });
  });

  afterAll(async () => {
    await deleteTestUser(testApp.app, owner.id);
    await deleteTestUser(testApp.app, pilot.id);
    await deleteTestUser(testApp.app, bystander.id);
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

  const markAnswer = (user: TestUser, commentId: string, isAnswer = true): request.Test =>
    request(testApp.server)
      .put(`${comments(publicSpot.id)}/${commentId}/answer`)
      .set('Authorization', as(user))
      .send({ isAnswer });

  async function conversationFor(user: TestUser): Promise<SpotCommentsDto> {
    const response = await request(testApp.server)
      .get(comments(publicSpot.id))
      .set('Authorization', as(user))
      .expect(200);

    return response.body as SpotCommentsDto;
  }

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
    expect(question).toMatchObject({
      byViewer: true,
      byOwner: false,
      canDelete: true,
      canMarkAnswer: false,
      answered: false,
    });
  });

  it('the owner replies, and may moderate the pilot’s question', async () => {
    const thread = (
      await post(owner, publicSpot.id, { body: 'Yes, by the gate', parentId: question.id }).expect(201)
    ).body as SpotCommentsDto;

    expect(thread.viewerOwnsSpot).toBe(true);

    const asked = thread.questions[0];
    expect(asked).toMatchObject({ byViewer: false, canDelete: true });

    ownerReply = asked.replies[0];
    expect(ownerReply).toMatchObject({ byOwner: true, byViewer: true, isAnswer: false });
  });

  it('replies go one level deep', async () => {
    await post(pilot, publicSpot.id, { body: 'Thanks!', parentId: ownerReply.id }).expect(400);
  });

  it('refuses an empty or overlong comment', async () => {
    await post(pilot, publicSpot.id, { body: '   ' }).expect(400);
    await post(pilot, publicSpot.id, { body: 'x'.repeat(2001) }).expect(400);
  });

  it('only the author can reword a comment', async () => {
    await request(testApp.server)
      .patch(`${comments(publicSpot.id)}/${ownerReply.id}`)
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

  describe('marking the answer', () => {
    let askerReply: SpotCommentDto;
    let bystanderReply: SpotCommentDto;

    beforeAll(async () => {
      await post(pilot, publicSpot.id, { body: 'Ok, thank you', parentId: question.id }).expect(201);
      const thread = (
        await post(bystander, publicSpot.id, { body: 'The gate shuts at 20:00', parentId: question.id }).expect(201)
      ).body as SpotCommentsDto;

      [, askerReply, bystanderReply] = thread.questions[0].replies;
    });

    it('anyone who can open the spot can answer a question', () => {
      expect(bystanderReply).toMatchObject({ byViewer: true, byOwner: false });
    });

    it('offers the mark to the asker and the owner, never on the asker’s own reply', async () => {
      const marks = async (user: TestUser): Promise<boolean[]> =>
        (await conversationFor(user)).questions[0].replies.map((reply) => reply.canMarkAnswer);

      // Replies in order: the owner's, the asker's thank-you, the bystander's.
      expect(await marks(pilot)).toEqual([true, false, true]);
      expect(await marks(owner)).toEqual([true, false, true]);
      expect(await marks(bystander)).toEqual([false, false, false]);
    });

    it('refuses a mark from a bystander, on a question, or on the asker’s own reply', async () => {
      await markAnswer(bystander, ownerReply.id).expect(404);
      await markAnswer(owner, question.id).expect(404);
      await markAnswer(owner, askerReply.id).expect(404);
      await markAnswer(pilot, askerReply.id).expect(404);
    });

    it('the asker marks the answer, the owner can move it, and the asker can take it back', async () => {
      let thread = (await markAnswer(pilot, ownerReply.id).expect(200)).body as SpotCommentsDto;
      expect(thread.questions[0].answered).toBe(true);

      thread = (await markAnswer(owner, bystanderReply.id).expect(200)).body as SpotCommentsDto;
      expect(thread.questions[0].replies.map((reply) => reply.isAnswer)).toEqual([false, false, true]);

      thread = (await markAnswer(pilot, bystanderReply.id, false).expect(200)).body as SpotCommentsDto;
      expect(thread.questions[0].answered).toBe(false);
    });
  });

  it("counts other people's comments as unread for the owner, until the owner reads them", async () => {
    // The pilot's question and thank-you, and the bystander's reply; the owner's own reply never counts.
    let unread = await unreadFor(owner);
    expect(unread.bySpot[publicSpot.id]).toBe(3);
    expect(unread.total).toBe(3);

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
      .delete(`${comments(publicSpot.id)}/${ownerReply.id}`)
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

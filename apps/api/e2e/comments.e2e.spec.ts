import type {
  BuildDto,
  CommentDto,
  ConversationDto,
  QuestionDto,
  SpotDto,
  UnreadCommentsDto,
} from '@spothub/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/prisma';
import { type TestApp, createTestApp } from './support/app';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

/**
 * Questions and replies on spots and builds, driven through the real routes as
 * three people: the owner, the pilot who asks, and a bystander who can also
 * open what is shared. The tests in each block run in order and build one
 * conversation, because the rules are about who did what to whose words.
 */
describe('comments', () => {
  let testApp: TestApp;
  let owner: TestUser;
  let pilot: TestUser;
  let bystander: TestUser;

  beforeAll(async () => {
    testApp = await createTestApp();
    owner = await createTestUser(testApp.app, 'comments-owner');
    pilot = await createTestUser(testApp.app, 'comments-pilot');
    bystander = await createTestUser(testApp.app, 'comments-bystander');
  });

  afterAll(async () => {
    await deleteTestUser(testApp.app, owner.id);
    await deleteTestUser(testApp.app, pilot.id);
    await deleteTestUser(testApp.app, bystander.id);
    await testApp.close();
  });

  const as = (user: TestUser): string => `Bearer ${user.accessToken}`;

  async function createAs<T>(user: TestUser, path: string, body: object): Promise<T> {
    const response = await request(testApp.server)
      .post(path)
      .set('Authorization', as(user))
      .send(body)
      .expect(201);

    return response.body as T;
  }

  async function unreadFor(user: TestUser): Promise<UnreadCommentsDto> {
    const response = await request(testApp.server)
      .get('/api/comments/unread')
      .set('Authorization', as(user))
      .expect(200);

    return response.body as UnreadCommentsDto;
  }

  describe('on a shared spot', () => {
    let publicSpot: SpotDto;
    let privateSpot: SpotDto;
    let question: QuestionDto;
    let ownerReply: CommentDto;

    beforeAll(async () => {
      publicSpot = await createAs<SpotDto>(owner, '/api/spots', {
        name: 'Talked-about field',
        lat: 49.4,
        lng: 11.4,
        visibility: 'PUBLIC',
      });
      privateSpot = await createAs<SpotDto>(owner, '/api/spots', {
        name: 'Secret field',
        lat: 49.5,
        lng: 11.5,
      });
    });

    const comments = (spotId: string): string => `/api/spots/${spotId}/comments`;

    const post = (user: TestUser, spotId: string, body: object): request.Test =>
      request(testApp.server)
        .post(comments(spotId))
        .set('Authorization', as(user))
        .send(body);

    const markAnswer = (
      user: TestUser,
      commentId: string,
      isAnswer = true,
    ): request.Test =>
      request(testApp.server)
        .put(`${comments(publicSpot.id)}/${commentId}/answer`)
        .set('Authorization', as(user))
        .send({ isAnswer });

    async function conversationFor(user: TestUser): Promise<ConversationDto> {
      const response = await request(testApp.server)
        .get(comments(publicSpot.id))
        .set('Authorization', as(user))
        .expect(200);

      return response.body as ConversationDto;
    }

    it('nobody can read or ask about a spot they cannot open', async () => {
      await request(testApp.server)
        .get(comments(privateSpot.id))
        .set('Authorization', as(pilot))
        .expect(404);

      await post(pilot, privateSpot.id, { body: 'Can I fly here?' }).expect(404);
    });

    it('a pilot asks on a shared spot, and sees the question as theirs', async () => {
      const thread = (
        await post(pilot, publicSpot.id, { body: '  Is parking free?  ' }).expect(201)
      ).body as ConversationDto;

      expect(thread.viewerOwnsSubject).toBe(false);
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
        await post(owner, publicSpot.id, {
          body: 'Yes, by the gate',
          parentId: question.id,
        }).expect(201)
      ).body as ConversationDto;

      expect(thread.viewerOwnsSubject).toBe(true);

      const asked = thread.questions[0];
      expect(asked).toMatchObject({ byViewer: false, canDelete: true });

      ownerReply = asked.replies[0];
      expect(ownerReply).toMatchObject({
        byOwner: true,
        byViewer: true,
        isAnswer: false,
      });
    });

    it('replies go one level deep', async () => {
      await post(pilot, publicSpot.id, {
        body: 'Thanks!',
        parentId: ownerReply.id,
      }).expect(400);
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
      ).body as ConversationDto;

      expect(thread.questions[0].body).toBe('Is parking free at weekends?');
      expect(thread.questions[0].editedAt).not.toBeNull();
    });

    describe('marking the answer', () => {
      let askerReply: CommentDto;
      let bystanderReply: CommentDto;

      beforeAll(async () => {
        await post(pilot, publicSpot.id, {
          body: 'Ok, thank you',
          parentId: question.id,
        }).expect(201);
        const thread = (
          await post(bystander, publicSpot.id, {
            body: 'The gate shuts at 20:00',
            parentId: question.id,
          }).expect(201)
        ).body as ConversationDto;

        [, askerReply, bystanderReply] = thread.questions[0].replies;
      });

      it('anyone who can open the spot can answer a question', () => {
        expect(bystanderReply).toMatchObject({ byViewer: true, byOwner: false });
      });

      it('offers the mark to the asker and the owner, never on the asker’s own reply', async () => {
        const marks = async (user: TestUser): Promise<boolean[]> =>
          (await conversationFor(user)).questions[0].replies.map(
            (reply) => reply.canMarkAnswer,
          );

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
        let thread = (await markAnswer(pilot, ownerReply.id).expect(200))
          .body as ConversationDto;
        expect(thread.questions[0].answered).toBe(true);

        thread = (await markAnswer(owner, bystanderReply.id).expect(200))
          .body as ConversationDto;
        expect(thread.questions[0].replies.map((reply) => reply.isAnswer)).toEqual([
          false,
          false,
          true,
        ]);

        thread = (await markAnswer(pilot, bystanderReply.id, false).expect(200))
          .body as ConversationDto;
        expect(thread.questions[0].answered).toBe(false);
      });
    });

    it("counts other people's comments as unread for the owner, until the owner reads them", async () => {
      // The pilot's question and thank-you, and the bystander's reply; the owner's own reply never counts.
      let unread = await unreadFor(owner);
      expect(unread.spots.bySubject[publicSpot.id]).toBe(3);
      expect(unread.spots.total).toBe(3);

      await request(testApp.server)
        .post(`${comments(publicSpot.id)}/read`)
        .set('Authorization', as(owner))
        .expect(204);

      unread = await unreadFor(owner);
      expect(unread.spots.bySubject[publicSpot.id]).toBeUndefined();
      expect(unread.spots.total).toBe(0);

      // Clear of the read marker's millisecond, so "after" is unambiguous.
      await new Promise((resolve) => setTimeout(resolve, 10));
      await post(pilot, publicSpot.id, { body: 'One more thing' }).expect(201);

      expect((await unreadFor(owner)).spots.bySubject[publicSpot.id]).toBe(1);
      // Nothing waits for the pilot: it is not their spot.
      expect((await unreadFor(pilot)).spots.total).toBe(0);
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
      ).body as ConversationDto;

      expect(thread.questions.map((entry) => entry.id)).not.toContain(question.id);

      const orphans = await testApp.app
        .get(PrismaService)
        .comment.count({ where: { parentId: question.id } });
      expect(orphans).toBe(0);
    });

    describe('when an asker deletes their own question', () => {
      const questionIn = (thread: ConversationDto, id: string): QuestionDto | undefined =>
        thread.questions.find((entry) => entry.id === id);

      const questionOf = (thread: ConversationDto, id: string): QuestionDto => {
        const found = questionIn(thread, id);

        if (!found) {
          throw new Error(`Question ${id} is not in the conversation`);
        }

        return found;
      };

      const remove = (user: TestUser, commentId: string): request.Test =>
        request(testApp.server)
          .delete(`${comments(publicSpot.id)}/${commentId}`)
          .set('Authorization', as(user));

      it('one nobody replied to is simply gone', async () => {
        const asked = (
          await post(pilot, publicSpot.id, { body: 'Never mind' }).expect(201)
        ).body as ConversationDto;
        const lonely = asked.questions[0];

        const thread = (await remove(pilot, lonely.id).expect(200))
          .body as ConversationDto;

        expect(questionIn(thread, lonely.id)).toBeUndefined();
        expect(
          await testApp.app
            .get(PrismaService)
            .comment.count({ where: { id: lonely.id } }),
        ).toBe(0);
      });

      describe('one that others replied to', () => {
        let asked: QuestionDto;
        let reply: CommentDto;

        beforeAll(async () => {
          asked = (
            (
              await post(pilot, publicSpot.id, {
                body: 'Is there shelter from the wind?',
              }).expect(201)
            ).body as ConversationDto
          ).questions[0];
          const thread = (
            await post(bystander, publicSpot.id, {
              body: 'Behind the tree line',
              parentId: asked.id,
            }).expect(201)
          ).body as ConversationDto;
          reply = questionOf(thread, asked.id).replies[0];
        });

        it('keeps the replies under a question with no words and no author, no longer unread', async () => {
          const unreadBefore =
            (await unreadFor(owner)).spots.bySubject[publicSpot.id] ?? 0;

          const thread = (await remove(pilot, asked.id).expect(200))
            .body as ConversationDto;

          // The question stops counting for the owner; the reply under it still does.
          expect((await unreadFor(owner)).spots.bySubject[publicSpot.id] ?? 0).toBe(
            unreadBefore - 1,
          );

          expect(questionIn(thread, asked.id)).toMatchObject({
            deleted: true,
            body: '',
            authorName: null,
            byViewer: false,
            byOwner: false,
            canDelete: false,
            editedAt: null,
          });
          expect(questionIn(thread, asked.id)?.replies.map((entry) => entry.id)).toEqual([
            reply.id,
          ]);

          const row = await testApp.app
            .get(PrismaService)
            .comment.findUnique({ where: { id: asked.id } });
          expect(row?.body).toBe('');

          // Only the owner may clear what is left.
          expect(questionIn(await conversationFor(owner), asked.id)?.canDelete).toBe(
            true,
          );
        });

        it('the asker cannot reword or delete it again, and nobody can reply to it', async () => {
          await request(testApp.server)
            .patch(`${comments(publicSpot.id)}/${asked.id}`)
            .set('Authorization', as(pilot))
            .send({ body: 'Back again' })
            .expect(404);
          await remove(pilot, asked.id).expect(404);
          await post(bystander, publicSpot.id, {
            body: 'Also the barn',
            parentId: asked.id,
          }).expect(400);
        });

        it('goes for good with its last reply', async () => {
          const thread = (await remove(bystander, reply.id).expect(200))
            .body as ConversationDto;

          expect(questionIn(thread, asked.id)).toBeUndefined();
          expect(
            await testApp.app
              .get(PrismaService)
              .comment.count({ where: { id: asked.id } }),
          ).toBe(0);
        });
      });

      it('the owner clearing a deleted question removes its replies too', async () => {
        const asked = (
          (await post(pilot, publicSpot.id, { body: 'Toilets nearby?' }).expect(201))
            .body as ConversationDto
        ).questions[0];
        await post(bystander, publicSpot.id, {
          body: 'At the petrol station',
          parentId: asked.id,
        }).expect(201);
        await remove(pilot, asked.id).expect(200);

        const thread = (await remove(owner, asked.id).expect(200))
          .body as ConversationDto;

        expect(questionIn(thread, asked.id)).toBeUndefined();
        expect(
          await testApp.app
            .get(PrismaService)
            .comment.count({ where: { parentId: asked.id } }),
        ).toBe(0);
      });
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

  describe('on a shared build', () => {
    let publicBuild: BuildDto;
    let privateBuild: BuildDto;
    let question: QuestionDto;

    beforeAll(async () => {
      publicBuild = await createAs<BuildDto>(owner, '/api/builds', {
        name: 'Asked-about five-inch',
        visibility: 'PUBLIC',
      });
      privateBuild = await createAs<BuildDto>(owner, '/api/builds', {
        name: 'Private cinelifter',
      });
    });

    const comments = (buildId: string): string => `/api/builds/${buildId}/comments`;

    it('nobody can read or ask about a build they cannot open', async () => {
      await request(testApp.server)
        .get(comments(privateBuild.id))
        .set('Authorization', as(pilot))
        .expect(404);

      await request(testApp.server)
        .post(comments(privateBuild.id))
        .set('Authorization', as(pilot))
        .send({ body: 'What props are these?' })
        .expect(404);
    });

    it('a pilot asks about the build, the owner answers, and the asker marks it', async () => {
      const asked = await createAs<ConversationDto>(pilot, comments(publicBuild.id), {
        body: 'Which props are on it?',
      });
      expect(asked.viewerOwnsSubject).toBe(false);
      question = asked.questions[0];

      const answered = await createAs<ConversationDto>(owner, comments(publicBuild.id), {
        body: 'HQ 5.1x3.1x3, triblade',
        parentId: question.id,
      });
      expect(answered.viewerOwnsSubject).toBe(true);
      const reply = answered.questions[0].replies[0];
      expect(reply).toMatchObject({ byOwner: true, canMarkAnswer: true });

      const marked = (
        await request(testApp.server)
          .put(`${comments(publicBuild.id)}/${reply.id}/answer`)
          .set('Authorization', as(pilot))
          .send({ isAnswer: true })
          .expect(200)
      ).body as ConversationDto;
      expect(marked.questions[0].answered).toBe(true);
    });

    it("counts the owner's unread build comments apart from spot ones, until read", async () => {
      const before = await unreadFor(owner);
      // The pilot's question only; the owner's own reply never counts.
      expect(before.builds.bySubject[publicBuild.id]).toBe(1);
      expect(before.builds.total).toBe(1);

      await request(testApp.server)
        .post(`${comments(publicBuild.id)}/read`)
        .set('Authorization', as(owner))
        .expect(204);

      const after = await unreadFor(owner);
      expect(after.builds.total).toBe(0);
      // Reading a build's conversation leaves the spots' counts as they were.
      expect(after.spots).toEqual(before.spots);
    });

    it('deleting the build deletes its conversation and read markers', async () => {
      await request(testApp.server)
        .delete(`/api/builds/${publicBuild.id}`)
        .set('Authorization', as(owner))
        .expect(204);

      const prisma = testApp.app.get(PrismaService);
      expect(await prisma.comment.count({ where: { buildId: publicBuild.id } })).toBe(0);
      expect(await prisma.commentRead.count({ where: { buildId: publicBuild.id } })).toBe(
        0,
      );
    });
  });

  it('a comment belongs to exactly one spot or build — the database refuses anything else', async () => {
    await expect(
      testApp.app
        .get(PrismaService)
        .comment.create({ data: { authorId: owner.id, body: 'about nothing' } }),
    ).rejects.toThrow();
  });
});

import type { SpotDto } from '@spothub/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/prisma';
import { type TestApp, createTestApp } from './support/app';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

describe('spots', () => {
  let testApp: TestApp;
  let owner: TestUser;
  let intruder: TestUser;
  let spot: SpotDto;

  beforeAll(async () => {
    testApp = await createTestApp();
    owner = await createTestUser(testApp.app, 'spot-owner');
    intruder = await createTestUser(testApp.app, 'spot-intruder');
  });

  afterAll(async () => {
    await deleteTestUser(testApp.app, owner.id);
    await deleteTestUser(testApp.app, intruder.id);
    await testApp.close();
  });

  const as = (user: TestUser): string => `Bearer ${user.accessToken}`;

  it('creates a spot at the coordinates given, private by default', async () => {
    const response = await request(testApp.server)
      .post('/api/spots')
      .set('Authorization', as(owner))
      .send({
        name: 'Schnaittach field',
        lat: 49.5591234,
        lng: 11.3412344,
        terrain: 'FIELD',
        difficulty: 2,
        hazards: ['POWERLINES', 'POWERLINES', 'PEOPLE'],
      })
      .expect(201);

    spot = response.body as SpotDto;

    expect(spot.slug).toBe('schnaittach-field');
    // Six decimal places: about 11 cm, and all a numeric(9,6) column keeps.
    expect(spot.lat).toBe(49.559123);
    expect(spot.lng).toBe(11.341234);
    expect(spot.hazards).toEqual(['POWERLINES', 'PEOPLE']);
    expect(spot.visibility).toBe('PRIVATE');
    expect(spot.access).toBe('UNKNOWN');
    expect(spot.locality).toBeNull();
  });

  it('refuses coordinates that are not on Earth', async () => {
    await request(testApp.server)
      .post('/api/spots')
      .set('Authorization', as(owner))
      .send({ name: 'Nowhere', lat: 91, lng: 0 })
      .expect(400);

    await request(testApp.server)
      .post('/api/spots')
      .set('Authorization', as(owner))
      .send({ name: 'Nowhere', lat: 0, lng: -180.5 })
      .expect(400);
  });

  it('changes only the fields a PATCH names, and lists the result', async () => {
    const patched = await request(testApp.server)
      .patch(`/api/spots/${spot.id}`)
      .set('Authorization', as(owner))
      .send({ locality: 'Schnaittach, Bavaria', difficulty: null })
      .expect(200);

    const body = patched.body as SpotDto;
    expect(body.locality).toBe('Schnaittach, Bavaria');
    expect(body.difficulty).toBeNull();
    // Absent from the patch, so untouched — not reset to a default.
    expect(body.name).toBe('Schnaittach field');
    expect(body.terrain).toBe('FIELD');
    expect(body.hazards).toEqual(['POWERLINES', 'PEOPLE']);
    expect(body.lat).toBe(49.559123);

    const list = await request(testApp.server)
      .get('/api/spots')
      .set('Authorization', as(owner))
      .expect(200);

    expect((list.body as SpotDto[]).map((entry) => entry.id)).toContain(spot.id);
  });

  it("a stranger cannot see, change or delete another owner's spot", async () => {
    await request(testApp.server)
      .get(`/api/spots/${spot.id}`)
      .set('Authorization', as(intruder))
      .expect(404);

    await request(testApp.server)
      .patch(`/api/spots/${spot.id}`)
      .set('Authorization', as(intruder))
      .send({ name: 'hijacked' })
      .expect(404);

    await request(testApp.server)
      .delete(`/api/spots/${spot.id}`)
      .set('Authorization', as(intruder))
      .expect(404);

    const list = await request(testApp.server)
      .get('/api/spots')
      .set('Authorization', as(intruder))
      .expect(200);

    expect((list.body as SpotDto[]).map((entry) => entry.id)).not.toContain(spot.id);

    const own = await request(testApp.server)
      .get(`/api/spots/${spot.id}`)
      .set('Authorization', as(owner))
      .expect(200);

    expect((own.body as SpotDto).name).toBe('Schnaittach field');
  });

  it('deletes it', async () => {
    await request(testApp.server)
      .delete(`/api/spots/${spot.id}`)
      .set('Authorization', as(owner))
      .expect(204);

    await request(testApp.server)
      .get(`/api/spots/${spot.id}`)
      .set('Authorization', as(owner))
      .expect(404);
  });

  describe('drafts from a GPS fix', () => {
    let draft: SpotDto;

    it('saves a private draft at the fix, under a placeholder name', async () => {
      const response = await request(testApp.server)
        .post('/api/spots/drafts')
        .set('Authorization', as(owner))
        .send({ lat: 49.1234567, lng: 11.7654321 })
        .expect(201);

      draft = response.body as SpotDto;

      expect(draft.isDraft).toBe(true);
      expect(draft.visibility).toBe('PRIVATE');
      expect(draft.name).toBe('Unnamed location');
      expect(draft.lat).toBe(49.123457);
      expect(draft.lng).toBe(11.765432);
    });

    it('refuses a fix that is not on Earth, or no fix at all', async () => {
      await request(testApp.server)
        .post('/api/spots/drafts')
        .set('Authorization', as(owner))
        .send({ lat: 95, lng: 0 })
        .expect(400);

      await request(testApp.server)
        .post('/api/spots/drafts')
        .set('Authorization', as(owner))
        .send({})
        .expect(400);
    });

    it('a second draft does not collide with the first', async () => {
      const second = await request(testApp.server)
        .post('/api/spots/drafts')
        .set('Authorization', as(owner))
        .send({ lat: 49.2, lng: 11.8 })
        .expect(201);

      expect((second.body as SpotDto).slug).not.toBe(draft.slug);

      await request(testApp.server)
        .delete(`/api/spots/${(second.body as SpotDto).id}`)
        .set('Authorization', as(owner))
        .expect(204);
    });

    it('finishing a draft clears the flag and takes its address from the new name', async () => {
      const response = await request(testApp.server)
        .patch(`/api/spots/${draft.id}`)
        .set('Authorization', as(owner))
        .send({ name: 'Rothenberg ridge', isDraft: false })
        .expect(200);

      const finished = response.body as SpotDto;
      expect(finished.isDraft).toBe(false);
      expect(finished.slug).toBe('rothenberg-ridge');
      expect(finished.lat).toBe(49.123457);
    });

    it('never turns a spot back into a draft', async () => {
      await request(testApp.server)
        .patch(`/api/spots/${draft.id}`)
        .set('Authorization', as(owner))
        .send({ isDraft: true })
        .expect(400);
    });
  });

  describe('a YouTube video', () => {
    let withVideo: SpotDto;

    it('keeps the video id and start time from a pasted link, never the link itself', async () => {
      const response = await request(testApp.server)
        .post('/api/spots')
        .set('Authorization', as(owner))
        .send({
          name: 'Video spot',
          lat: 49.5,
          lng: 11.3,
          video: 'https://youtu.be/aBcDeFgHi_1?t=1m30s',
        })
        .expect(201);

      withVideo = response.body as SpotDto;
      expect(withVideo.video).toEqual({ youtubeId: 'aBcDeFgHi_1', startS: 90 });
    });

    const links: readonly (readonly [string, SpotDto['video']])[] = [
      [
        'https://www.youtube.com/watch?v=aBcDeFgHi_2&t=42',
        { youtubeId: 'aBcDeFgHi_2', startS: 42 },
      ],
      ['youtube.com/shorts/aBcDeFgHi_3', { youtubeId: 'aBcDeFgHi_3', startS: null }],
      [
        'https://m.youtube.com/live/aBcDeFgHi_4?start=5',
        { youtubeId: 'aBcDeFgHi_4', startS: 5 },
      ],
    ];

    it.each(links)('reads %s', async (link, expected) => {
      const response = await request(testApp.server)
        .patch(`/api/spots/${withVideo.id}`)
        .set('Authorization', as(owner))
        .send({ video: link })
        .expect(200);

      expect((response.body as SpotDto).video).toEqual(expected);
    });

    it('leaves the video alone when a PATCH does not name it', async () => {
      const response = await request(testApp.server)
        .patch(`/api/spots/${withVideo.id}`)
        .set('Authorization', as(owner))
        .send({ name: 'Video spot renamed' })
        .expect(200);

      expect((response.body as SpotDto).video).toEqual({
        youtubeId: 'aBcDeFgHi_4',
        startS: 5,
      });
    });

    it('refuses a link that is not to a YouTube video', async () => {
      for (const video of [
        'https://vimeo.com/123456789',
        'https://www.youtube.com/watch?v=tooshort',
        'https://youtube.com.example.org/watch?v=aBcDeFgHi_1',
        'https://www.youtube.com/@somechannel',
      ]) {
        await request(testApp.server)
          .patch(`/api/spots/${withVideo.id}`)
          .set('Authorization', as(owner))
          .send({ video })
          .expect(400);
      }
    });

    it('removes the video with null', async () => {
      const response = await request(testApp.server)
        .patch(`/api/spots/${withVideo.id}`)
        .set('Authorization', as(owner))
        .send({ video: null })
        .expect(200);

      expect((response.body as SpotDto).video).toBeNull();
    });

    it('takes back a video the shared schema already parsed, as the form sends it', async () => {
      const response = await request(testApp.server)
        .patch(`/api/spots/${withVideo.id}`)
        .set('Authorization', as(owner))
        .send({ video: { youtubeId: 'aBcDeFgHi_5', startS: 12 } })
        .expect(200);

      expect((response.body as SpotDto).video).toEqual({
        youtubeId: 'aBcDeFgHi_5',
        startS: 12,
      });

      await request(testApp.server)
        .patch(`/api/spots/${withVideo.id}`)
        .set('Authorization', as(owner))
        .send({ video: { youtubeId: 'bad"><script', startS: null } })
        .expect(400);
    });
  });

  describe('shared with other pilots', () => {
    let publicSpot: SpotDto;
    let unlistedSpot: SpotDto;

    const createAs = async (user: TestUser, body: object): Promise<SpotDto> =>
      (
        await request(testApp.server)
          .post('/api/spots')
          .set('Authorization', as(user))
          .send(body)
          .expect(201)
      ).body as SpotDto;

    const sharedIdsFor = async (user: TestUser): Promise<string[]> =>
      (
        (
          await request(testApp.server)
            .get('/api/spots/shared')
            .set('Authorization', as(user))
            .expect(200)
        ).body as SpotDto[]
      ).map((entry) => entry.id);

    beforeAll(async () => {
      publicSpot = await createAs(owner, {
        name: 'Public ridge',
        lat: 49.1,
        lng: 11.1,
        visibility: 'PUBLIC',
      });
      unlistedSpot = await createAs(owner, {
        name: 'Unlisted quarry',
        lat: 49.2,
        lng: 11.2,
        visibility: 'UNLISTED',
      });
    });

    it('a public spot is listed for other pilots and opens for them, read-only', async () => {
      expect(await sharedIdsFor(intruder)).toContain(publicSpot.id);

      const opened = await request(testApp.server)
        .get(`/api/spots/${publicSpot.id}`)
        .set('Authorization', as(intruder))
        .expect(200);

      const body = opened.body as SpotDto;
      const ownerRow = await testApp.app
        .get(PrismaService)
        .user.findUniqueOrThrow({ where: { id: owner.id } });

      expect(body.ownedByViewer).toBe(false);
      expect(body.ownerName).toBe(ownerRow.displayName);
      // The owner is named, never addressed.
      expect(JSON.stringify(body)).not.toContain(ownerRow.email);

      await request(testApp.server)
        .patch(`/api/spots/${publicSpot.id}`)
        .set('Authorization', as(intruder))
        .send({ name: 'hijacked' })
        .expect(404);

      await request(testApp.server)
        .delete(`/api/spots/${publicSpot.id}`)
        .set('Authorization', as(intruder))
        .expect(404);
    });

    it('an unlisted spot opens by its link but is never listed', async () => {
      await request(testApp.server)
        .get(`/api/spots/${unlistedSpot.id}`)
        .set('Authorization', as(intruder))
        .expect(200);

      expect(await sharedIdsFor(intruder)).not.toContain(unlistedSpot.id);
    });

    it('the owner sees it as theirs, and their shared list leaves out their own spots', async () => {
      const opened = await request(testApp.server)
        .get(`/api/spots/${publicSpot.id}`)
        .set('Authorization', as(owner))
        .expect(200);

      expect((opened.body as SpotDto).ownedByViewer).toBe(true);
      expect(await sharedIdsFor(owner)).not.toContain(publicSpot.id);
    });

    it('making a spot private again takes it back from everyone else', async () => {
      await request(testApp.server)
        .patch(`/api/spots/${publicSpot.id}`)
        .set('Authorization', as(owner))
        .send({ visibility: 'PRIVATE' })
        .expect(200);

      await request(testApp.server)
        .get(`/api/spots/${publicSpot.id}`)
        .set('Authorization', as(intruder))
        .expect(404);

      expect(await sharedIdsFor(intruder)).not.toContain(publicSpot.id);
    });

    it('a draft is never shared, whatever its visibility says', async () => {
      const draft = (
        await request(testApp.server)
          .post('/api/spots/drafts')
          .set('Authorization', as(owner))
          .send({ lat: 49.3, lng: 11.3 })
          .expect(201)
      ).body as SpotDto;

      await request(testApp.server)
        .patch(`/api/spots/${draft.id}`)
        .set('Authorization', as(owner))
        .send({ visibility: 'PUBLIC' })
        .expect(200);

      await request(testApp.server)
        .get(`/api/spots/${draft.id}`)
        .set('Authorization', as(intruder))
        .expect(404);

      expect(await sharedIdsFor(intruder)).not.toContain(draft.id);
    });
  });
});

import type { SpotDto } from '@spothub/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
});

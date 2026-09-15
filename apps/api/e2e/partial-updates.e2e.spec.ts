import type {
  BuildDto,
  PartDto,
  PartSourceDto,
  PartUnitDto,
  PostDto,
  RepairDto,
} from '@spothub/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type TestApp, createTestApp } from './support/app';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

/**
 * A PATCH changes the fields it names and nothing else.
 *
 * zod 4 applies a `.default()` even inside `.partial()`, so an update schema
 * derived from fields that carry defaults quietly fills in every field the
 * request left out — and the service, seeing them present, writes them. A
 * rename would reset a build's status to PLANNING; a note on a part would wipe
 * its spec. Each test here sets every defaulted field to something other than
 * its default, patches one unrelated field, and checks the rest survived.
 */
describe('partial updates', () => {
  let testApp: TestApp;
  let owner: TestUser;

  beforeAll(async () => {
    testApp = await createTestApp();
    owner = await createTestUser(testApp.app, 'partial-updates');
  });

  afterAll(async () => {
    await deleteTestUser(testApp.app, owner.id);
    await testApp.close();
  });

  const auth = (): string => `Bearer ${owner.accessToken}`;

  it('renaming a build leaves its class, status, weight, GPS, notes and dates alone', async () => {
    const created = await request(testApp.server)
      .post('/api/builds')
      .set('Authorization', auth())
      .send({
        name: 'Partial build',
        buildClass: 'FIVE_INCH',
        status: 'ACTIVE',
        visibility: 'UNLISTED',
        weightG: 650,
        hasGps: true,
        descriptionMd: 'Freestyle rig',
        builtOn: '2026-03-01',
        retiredOn: '2026-08-01',
      })
      .expect(201);

    const build = created.body as BuildDto;

    const patched = await request(testApp.server)
      .patch(`/api/builds/${build.id}`)
      .set('Authorization', auth())
      .send({ name: 'Partial build renamed' })
      .expect(200);

    const after = patched.body as BuildDto;
    expect(after.name).toBe('Partial build renamed');
    expect(after.buildClass).toBe('FIVE_INCH');
    expect(after.status).toBe('ACTIVE');
    expect(after.visibility).toBe('UNLISTED');
    expect(after.weightG).toBe(650);
    expect(after.hasGps).toBe(true);
    expect(after.descriptionMd).toBe('Freestyle rig');
    expect(after.builtOn).toBe('2026-03-01');
    expect(after.retiredOn).toBe('2026-08-01');
  });

  describe('a part, its unit and its source', () => {
    let part: PartDto;

    beforeAll(async () => {
      const created = await request(testApp.server)
        .post('/api/parts')
        .set('Authorization', auth())
        .send({
          category: 'MOTOR',
          manufacturer: 'T-Motor',
          model: 'F60 Pro V',
          spec: { kv: 1750, stator: '2207' },
          notesMd: 'Bought as a set of four',
          quantity: 1,
        })
        .expect(201);

      part = created.body as PartDto;
    });

    it('a note on a part leaves its maker, model and spec alone', async () => {
      const patched = await request(testApp.server)
        .patch(`/api/parts/${part.id}`)
        .set('Authorization', auth())
        .send({ notesMd: 'One bearing is rough' })
        .expect(200);

      const after = patched.body as PartDto;
      expect(after.notesMd).toBe('One bearing is rough');
      expect(after.manufacturer).toBe('T-Motor');
      expect(after.model).toBe('F60 Pro V');
      expect(after.spec).toEqual({ kv: 1750, stator: '2207' });
    });

    it("labelling a unit leaves its condition, date and notes alone", async () => {
      const created = await request(testApp.server)
        .post(`/api/parts/${part.id}/units`)
        .set('Authorization', auth())
        .send({ condition: 'BROKEN', acquiredOn: '2026-02-14', notes: 'Bent shaft' })
        .expect(201);

      const unit = created.body as PartUnitDto;

      const patched = await request(testApp.server)
        .patch(`/api/parts/${part.id}/units/${unit.id}`)
        .set('Authorization', auth())
        .send({ label: 'M5' })
        .expect(200);

      const after = patched.body as PartUnitDto;
      expect(after.label).toBe('M5');
      expect(after.condition).toBe('BROKEN');
      expect(after.acquiredOn).toBe('2026-02-14');
      expect(after.notes).toBe('Bent shaft');
    });

    it('correcting a vendor leaves the price, purchase and quantity alone', async () => {
      const created = await request(testApp.server)
        .post(`/api/parts/${part.id}/sources`)
        .set('Authorization', auth())
        .send({
          vendor: 'Some shop',
          url: 'https://example.com/f60',
          price: 24.5,
          currency: 'EUR',
          isPurchase: true,
          purchasedOn: '2026-02-10',
          quantity: 4,
        })
        .expect(201);

      const source = created.body as PartSourceDto;

      const patched = await request(testApp.server)
        .patch(`/api/parts/${part.id}/sources/${source.id}`)
        .set('Authorization', auth())
        .send({ vendor: 'Another shop' })
        .expect(200);

      const after = patched.body as PartSourceDto;
      expect(after.vendor).toBe('Another shop');
      expect(after.url).toBe('https://example.com/f60');
      expect(after.price).toBe(24.5);
      expect(after.currency).toBe('EUR');
      expect(after.isPurchase).toBe(true);
      expect(after.purchasedOn).toBe('2026-02-10');
      expect(after.quantity).toBe(4);
    });
  });

  it('describing a repair leaves its cause and cost alone', async () => {
    const build = await request(testApp.server)
      .post('/api/builds')
      .set('Authorization', auth())
      .send({ name: 'Repair build' })
      .expect(201);

    const buildId = (build.body as BuildDto).id;

    const created = await request(testApp.server)
      .post(`/api/builds/${buildId}/repairs`)
      .set('Authorization', auth())
      .send({ occurredOn: '2026-04-02', cause: 'WEAR', cost: 12, currency: 'EUR' })
      .expect(201);

    const repair = created.body as RepairDto;

    const patched = await request(testApp.server)
      .patch(`/api/builds/${buildId}/repairs/${repair.id}`)
      .set('Authorization', auth())
      .send({ descriptionMd: 'Swapped the worn bearings' })
      .expect(200);

    const after = patched.body as RepairDto;
    expect(after.descriptionMd).toBe('Swapped the worn bearings');
    expect(after.cause).toBe('WEAR');
    expect(after.cost).toBe(12);
    expect(after.currency).toBe('EUR');
    expect(after.occurredOn).toBe('2026-04-02');
  });

  it('retitling a post leaves its summary, body, visibility and builds alone', async () => {
    const build = await request(testApp.server)
      .post('/api/builds')
      .set('Authorization', auth())
      .send({ name: 'Post build' })
      .expect(201);

    const buildId = (build.body as BuildDto).id;

    const created = await request(testApp.server)
      .post('/api/posts')
      .set('Authorization', auth())
      .send({
        title: 'Partial post',
        summary: 'A short one',
        bodyMd: 'Words',
        visibility: 'UNLISTED',
        buildIds: [buildId],
      })
      .expect(201);

    const post = created.body as PostDto;

    const patched = await request(testApp.server)
      .patch(`/api/posts/${post.id}`)
      .set('Authorization', auth())
      .send({ title: 'Partial post retitled' })
      .expect(200);

    const after = patched.body as PostDto;
    expect(after.title).toBe('Partial post retitled');
    expect(after.summary).toBe('A short one');
    expect(after.bodyMd).toBe('Words');
    expect(after.visibility).toBe('UNLISTED');
    expect(after.buildIds).toEqual([buildId]);
    expect(after.publishedAt).toBe(post.publishedAt);
  });
});

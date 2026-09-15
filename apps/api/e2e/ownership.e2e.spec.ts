import type { SessionDto } from '@spothub/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type TestApp, createTestApp } from './support/app';
import { type OwnedFlightFixture, seedOwnedFlight } from './support/seed';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

/**
 * The one thing nothing else tests: every repository method takes `ownerId`
 * first, and updates and deletes go through `updateMany`/`deleteMany` scoped
 * by it, so a cross-tenant write is meant to be inexpressible. This is what
 * proves it, for the surface owning's-created this session — builds, a
 * battery pack, and a flight — through the real HTTP routes.
 */
describe('ownership', () => {
  let testApp: TestApp;
  let owner: TestUser;
  let intruder: TestUser;
  let fixture: OwnedFlightFixture;

  beforeAll(async () => {
    testApp = await createTestApp();
    owner = await createTestUser(testApp.app, 'owner');
    intruder = await createTestUser(testApp.app, 'intruder');
    fixture = await seedOwnedFlight(testApp.app, owner.id);
  });

  afterAll(async () => {
    await deleteTestUser(testApp.app, owner.id);
    await deleteTestUser(testApp.app, intruder.id);
    await testApp.close();
  });

  const as = (user: TestUser): string => `Bearer ${user.accessToken}`;

  it("a stranger cannot read, rename or delete another owner's build", async () => {
    await request(testApp.server)
      .get(`/api/builds/${fixture.buildId}`)
      .set('Authorization', as(intruder))
      .expect(404);

    await request(testApp.server)
      .patch(`/api/builds/${fixture.buildId}`)
      .set('Authorization', as(intruder))
      .send({ name: 'hijacked' })
      .expect(404);

    await request(testApp.server)
      .delete(`/api/builds/${fixture.buildId}`)
      .set('Authorization', as(intruder))
      .expect(404);
  });

  it("a stranger cannot change or delete another owner's battery pack", async () => {
    await request(testApp.server)
      .patch(`/api/parts/${fixture.partId}/units/${fixture.batteryUnitId}`)
      .set('Authorization', as(intruder))
      .send({ label: 'hijacked' })
      .expect(404);

    await request(testApp.server)
      .delete(`/api/parts/${fixture.partId}/units/${fixture.batteryUnitId}`)
      .set('Authorization', as(intruder))
      .expect(404);
  });

  it("a stranger's own logbook never shows another owner's flight", async () => {
    const response = await request(testApp.server)
      .get('/api/flights/sessions')
      .set('Authorization', as(intruder))
      .expect(200);

    const flightIds = (response.body as SessionDto[]).flatMap((session) =>
      session.flights.map((flight) => flight.id),
    );
    expect(flightIds).not.toContain(fixture.flightId);
  });

  it("a stranger cannot change or delete another owner's flight", async () => {
    await request(testApp.server)
      .patch(`/api/flights/${fixture.flightId}`)
      .set('Authorization', as(intruder))
      .send({ buildId: null })
      .expect(404);

    await request(testApp.server)
      .delete(`/api/flights/${fixture.flightId}`)
      .set('Authorization', as(intruder))
      .expect(404);
  });

  it("every attempt left the real owner's data exactly as it was", async () => {
    await request(testApp.server)
      .get(`/api/builds/${fixture.buildId}`)
      .set('Authorization', as(owner))
      .expect(200)
      .expect(({ body }: { body: { name: string } }) => {
        expect(body.name).toBe('e2e build');
      });

    const response = await request(testApp.server)
      .get('/api/flights/sessions')
      .set('Authorization', as(owner))
      .expect(200);

    const flight = (response.body as SessionDto[])
      .flatMap((session) => session.flights)
      .find((candidate) => candidate.id === fixture.flightId);

    expect(flight).toBeDefined();
    expect(flight?.buildId).toBe(fixture.buildId);
    expect(flight?.batteryUnitId).toBe(fixture.batteryUnitId);
  });
});

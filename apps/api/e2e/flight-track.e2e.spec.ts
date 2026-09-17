import { join } from 'node:path';

import type { FlightDto, FlightTrackDto, SessionDto } from '@spothub/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type TestApp, createTestApp } from './support/app';
import { importFixture } from './support/flight-logs';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

const EDGETX = join(__dirname, '../src/flight-logs/formats/edgetx/__fixtures__');
const GPX = join(__dirname, '../src/flight-logs/formats/gpx/__fixtures__');

/**
 * A flight's path, read back out of the log it arrived in.
 *
 * Nothing about a track is stored a second time, so this proves the whole way
 * back: the flight says which file holds its fixes, the file is fetched from
 * storage, parsed again, cut to the flight's own window and thinned.
 */
describe('flight track', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(() => testApp.close());

  const auth = (user: TestUser): [string, string] => [
    'Authorization',
    `Bearer ${user.accessToken}`,
  ];

  async function onlyFlight(user: TestUser): Promise<FlightDto> {
    const response = await request(testApp.server)
      .get('/api/flights/sessions')
      .set(...auth(user));
    const flights = (response.body as SessionDto[]).flatMap((session) => session.flights);

    expect(flights).toHaveLength(1);

    return flights[0];
  }

  async function track(
    user: TestUser,
    flightId: string,
    status = 200,
  ): Promise<FlightTrackDto> {
    const response = await request(testApp.server)
      .get(`/api/flight-logs/tracks/${flightId}`)
      .set(...auth(user))
      .expect(status);

    return response.body as FlightTrackDto;
  }

  describe('a flight whose radio log carried its own GPS', () => {
    let user: TestUser;
    let flight: FlightDto;

    beforeAll(async () => {
      user = await createTestUser(testApp.app, 'track-edgetx');
      await importFixture(
        testApp,
        user.accessToken,
        join(EDGETX, 'Air65-2026-09-14-183210.csv'),
      );
      flight = await onlyFlight(user);
    });

    afterAll(() => deleteTestUser(testApp.app, user.id));

    it('answers with the path the quad flew', async () => {
      const path = await track(user, flight.id);

      expect(path.flightId).toBe(flight.id);
      expect(path.points.length).toBeGreaterThan(10);
      expect(path.takeoffAltitudeM).not.toBeNull();
    });

    it('times every point from the flight itself, in order, inside its length', async () => {
      const { points } = await track(user, flight.id);
      const times = points.map((point) => point.t);

      // Not at zero: a quad that armed before its GPS locked has no fix for
      // the first seconds, and inventing one would draw a line it never flew.
      expect(times[0]).toBeGreaterThanOrEqual(-5_000);
      expect(times[0]).toBeLessThan(10_000);
      expect([...times].sort((first, second) => first - second)).toEqual(times);
      // The window is the flight's own, with a few seconds of slack either side.
      expect(times.at(-1)).toBeLessThanOrEqual((flight.durationS + 10) * 1000);
    });

    it('gives each point a position and a speed measured from the track', async () => {
      const { points } = await track(user, flight.id);
      const fastest = Math.max(...points.map((point) => point.speedKmh ?? 0));

      expect(
        points.every((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)),
      ).toBe(true);
      // Measured from positions, so near the flight's own recorded top speed
      // without being it — that came from the GPS module's speed sensor.
      expect(fastest).toBeGreaterThan(1);
      expect(fastest).toBeLessThan((flight.maxSpeedKmh ?? 0) * 3 + 10);
    });
  });

  describe('a flight a GPX track joined', () => {
    let user: TestUser;

    beforeAll(async () => {
      user = await createTestUser(testApp.app, 'track-gpx');
      await importFixture(testApp, user.accessToken, join(GPX, 'air65-loop-utc.gpx'));
    });

    afterAll(() => deleteTestUser(testApp.app, user.id));

    it('reads the path out of the GPX', async () => {
      const flight = await onlyFlight(user);

      const path = await track(user, flight.id);

      expect(path.points.length).toBeGreaterThan(10);
      expect(path.points.every((point) => point.altM !== null)).toBe(true);
    });
  });

  describe('whose flight it is', () => {
    let owner: TestUser;
    let stranger: TestUser;
    let flight: FlightDto;

    beforeAll(async () => {
      owner = await createTestUser(testApp.app, 'track-owner');
      stranger = await createTestUser(testApp.app, 'track-stranger');
      await importFixture(testApp, owner.accessToken, join(GPX, 'air65-loop-utc.gpx'));
      flight = await onlyFlight(owner);
    });

    afterAll(async () => {
      await deleteTestUser(testApp.app, owner.id);
      await deleteTestUser(testApp.app, stranger.id);
    });

    it('is nobody else’s to read', async () => {
      await track(stranger, flight.id, 404);
    });

    it('needs signing in at all', async () => {
      await request(testApp.server)
        .get(`/api/flight-logs/tracks/${flight.id}`)
        .expect(401);
    });

    it('answers not found for a flight that does not exist', async () => {
      await track(owner, '11111111-2222-3333-4444-555555555555', 404);
    });
  });
});

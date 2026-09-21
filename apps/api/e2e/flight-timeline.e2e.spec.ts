import { join } from 'node:path';

import type { FlightDto, FlightTimelineDto, SessionDto } from '@spothub/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type TestApp, createTestApp } from './support/app';
import { importFixture } from './support/flight-logs';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

const EDGETX = join(__dirname, '../src/flight-logs/formats/edgetx/__fixtures__');
const BLACKBOX = join(__dirname, '../src/flight-logs/formats/blackbox/__fixtures__');
const GPX = join(__dirname, '../src/flight-logs/formats/gpx/__fixtures__');

/**
 * One flight in detail: what the pack, the sticks and the link did, read back
 * out of the log the flight arrived in.
 *
 * Nothing of this is stored a second time, so these tests prove the whole way
 * back — the flight says which file it came from, the file is fetched from
 * storage, parsed again, cut to the flight's own window and thinned. A
 * blackbox log matters most here: it records no time of day, so its readings
 * are only in the right place if the same origin the import invented is
 * rebuilt from the day the flight was stored on.
 */
describe('flight timeline', () => {
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

  async function timeline(
    user: TestUser,
    flightId: string,
    status = 200,
  ): Promise<FlightTimelineDto> {
    const response = await request(testApp.server)
      .get(`/api/flight-logs/timelines/${flightId}`)
      .set(...auth(user))
      .expect(status);

    return response.body as FlightTimelineDto;
  }

  describe('a radio log', () => {
    let user: TestUser;
    let flight: FlightDto;

    beforeAll(async () => {
      user = await createTestUser(testApp.app, 'timeline-edgetx');
      await importFixture(
        testApp,
        user.accessToken,
        join(EDGETX, 'Air65-2026-09-14-183210.csv'),
      );
      flight = await onlyFlight(user);
    });

    afterAll(() => deleteTestUser(testApp.app, user.id));

    it('answers with what the radio heard, second by second', async () => {
      const detail = await timeline(user, flight.id);

      expect(detail.flightId).toBe(flight.id);
      expect(detail.points.length).toBeGreaterThan(10);
      // Telemetry was off on this quad, but the radio logs its own link.
      expect(detail.points.some((point) => point.linkQuality !== null)).toBe(true);
      expect(detail.points.some((point) => point.throttlePct !== null)).toBe(true);
    });

    it('times every reading from take-off, in order, inside the flight', async () => {
      const { points } = await timeline(user, flight.id);
      const times = points.map((point) => point.t);

      expect(times[0]).toBeGreaterThanOrEqual(-5_000);
      expect([...times].sort((first, second) => first - second)).toEqual(times);
      expect(times.at(-1)).toBeLessThanOrEqual((flight.durationS + 10) * 1000);
    });

    it('agrees with the figures the import recorded for the same flight', async () => {
      const { points } = await timeline(user, flight.id);
      const linkQualities = points
        .map((point) => point.linkQuality)
        .filter((value): value is number => value !== null);

      expect(Math.min(...linkQualities)).toBe(flight.minLinkQuality);
    });
  });

  describe('a blackbox log, whose own clock was never set', () => {
    let user: TestUser;
    let flight: FlightDto;

    beforeAll(async () => {
      user = await createTestUser(testApp.app, 'timeline-blackbox');
      await importFixture(
        testApp,
        user.accessToken,
        join(BLACKBOX, 'cinelog20', 'btfl_001.bbl'),
        { flownOn: '2026-09-13' },
      );
      flight = await onlyFlight(user);
    });

    afterAll(() => deleteTestUser(testApp.app, user.id));

    it('carries the pack readings a radio never sees', async () => {
      const detail = await timeline(user, flight.id);

      expect(detail.points.length).toBeGreaterThan(10);
      expect(detail.points.some((point) => point.voltage !== null)).toBe(true);
      expect(detail.points.some((point) => point.currentA !== null)).toBe(true);
      // The link belongs to the radio; a flight controller knows nothing of it.
      expect(detail.points.every((point) => point.linkQuality === null)).toBe(true);
    });

    it('places its frames on the flight it was stored as, not on its own zero', async () => {
      const { points } = await timeline(user, flight.id);

      expect(points[0].t).toBeGreaterThanOrEqual(-5_000);
      expect(points.at(-1)?.t).toBeLessThanOrEqual((flight.durationS + 10) * 1000);
    });

    it('thins a log of thousands of frames to something a chart can draw', async () => {
      const { points } = await timeline(user, flight.id);

      // At most one over the cap: the landing is kept whatever the arithmetic says.
      expect(points.length).toBeLessThanOrEqual(401);
      // And the thinning still ends at the landing, not somewhere before it.
      expect(points.at(-1)?.t).toBeGreaterThan((flight.durationS - 5) * 1000);
    });

    it('agrees with the lowest voltage the import recorded', async () => {
      const { points } = await timeline(user, flight.id);
      const voltages = points
        .map((point) => point.voltage)
        .filter((value): value is number => value !== null);

      // Thinned, so never below what every frame gave — but within a little of it.
      expect(Math.min(...voltages)).toBeGreaterThanOrEqual(flight.minVoltage ?? 0);
      expect(Math.min(...voltages)).toBeLessThan((flight.minVoltage ?? 0) + 1);
    });
  });

  describe('a GPX track', () => {
    let user: TestUser;

    beforeAll(async () => {
      user = await createTestUser(testApp.app, 'timeline-gpx');
      await importFixture(testApp, user.accessToken, join(GPX, 'air65-loop-utc.gpx'));
    });

    afterAll(() => deleteTestUser(testApp.app, user.id));

    it('has nothing to tell: a track says where the quad was, not what it did', async () => {
      const flight = await onlyFlight(user);

      const detail = await timeline(user, flight.id);

      expect(detail.points).toEqual([]);
    });
  });

  describe('whose flight it is', () => {
    let owner: TestUser;
    let stranger: TestUser;
    let flight: FlightDto;

    beforeAll(async () => {
      owner = await createTestUser(testApp.app, 'timeline-owner');
      stranger = await createTestUser(testApp.app, 'timeline-stranger');
      await importFixture(
        testApp,
        owner.accessToken,
        join(EDGETX, 'Air65-2026-09-14-183210.csv'),
      );
      flight = await onlyFlight(owner);
    });

    afterAll(async () => {
      await deleteTestUser(testApp.app, owner.id);
      await deleteTestUser(testApp.app, stranger.id);
    });

    it('is nobody else’s to read', async () => {
      await timeline(stranger, flight.id, 404);
    });

    it('needs signing in at all', async () => {
      await request(testApp.server)
        .get(`/api/flight-logs/timelines/${flight.id}`)
        .expect(401);
    });

    it('answers not found for a flight that does not exist', async () => {
      await timeline(owner, '11111111-2222-3333-4444-555555555555', 404);
    });
  });
});

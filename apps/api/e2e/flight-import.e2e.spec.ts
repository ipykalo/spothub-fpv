import { join } from 'node:path';

import type { FlightDto, SessionDto } from '@spothub/shared';
import { LogImportStatus } from '@spothub/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type TestApp, createTestApp } from './support/app';
import { importFixture } from './support/flight-logs';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

const EDGETX = join(__dirname, '../src/flight-logs/formats/edgetx/__fixtures__');
const GPX = join(__dirname, '../src/flight-logs/formats/gpx/__fixtures__');

async function sessions(
  testApp: TestApp,
  accessToken: string,
): Promise<readonly SessionDto[]> {
  const response = await request(testApp.server)
    .get('/api/flights/sessions')
    .set('Authorization', `Bearer ${accessToken}`);

  return response.body as SessionDto[];
}

function onlyFlight(sessionList: readonly SessionDto[]): FlightDto {
  const flights = sessionList.flatMap((session) => session.flights);
  expect(flights).toHaveLength(1);
  return flights[0];
}

describe('flight import', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(() => testApp.close());

  describe('an EdgeTX log with its own GPS, then the GPX track of the same flight', () => {
    let user: TestUser;

    beforeAll(async () => {
      user = await createTestUser(testApp.app, 'import-join');
    });

    afterAll(() => deleteTestUser(testApp.app, user.id));

    it('imports the radio log, with the GPS figures its own telemetry gave it', async () => {
      const batch = await importFixture(
        testApp,
        user.accessToken,
        join(EDGETX, 'Air65-2026-09-14-183210.csv'),
      );

      expect(batch.status).toBe(LogImportStatus.Done);
      expect(batch.flightCount).toBe(1);

      const flight = onlyFlight(await sessions(testApp, user.accessToken));
      expect(flight.hasGps).toBe(true);
      expect(flight.distanceM).toBe(301);
      // GSpd(kts) converted to km/h: this once shipped as 16, half of correct.
      expect(flight.maxSpeedKmh).toBe(29.6);
    });

    it('joins the GPX track to that flight instead of storing a second one, keeping its own GPS', async () => {
      const batch = await importFixture(
        testApp,
        user.accessToken,
        join(GPX, 'air65-loop-utc.gpx'),
      );

      expect(batch.status).toBe(LogImportStatus.Done);
      expect(batch.flightCount).toBe(1);

      // Still one flight, not two — the track joined rather than duplicating.
      const flight = onlyFlight(await sessions(testApp, user.accessToken));
      // The radio log's own reading, not the GPX's — a flight with GPS keeps it.
      expect(flight.maxSpeedKmh).toBe(29.6);
    });
  });

  describe('a GPX track that overlaps no imported flight', () => {
    let user: TestUser;

    beforeAll(async () => {
      user = await createTestUser(testApp.app, 'import-unmatched');
    });

    afterAll(() => deleteTestUser(testApp.app, user.id));

    it('is stored as a flight of its own, GPS figures measured from its positions', async () => {
      const batch = await importFixture(
        testApp,
        user.accessToken,
        join(GPX, 'air65-loop-utc.gpx'),
      );

      expect(batch.status).toBe(LogImportStatus.Done);
      expect(batch.flightCount).toBe(1);

      const flight = onlyFlight(await sessions(testApp, user.accessToken));
      expect(flight.hasGps).toBe(true);
      expect(flight.startedAt).toBe('2026-09-14T16:32:13.000Z');
      expect(flight.distanceM).toBe(301);
      // No speed sensor of its own: measured from the positions, not the
      // 29.6 the radio log's GPS module claims for the same flight.
      expect(flight.maxSpeedKmh).toBe(9.3);
      // Nothing a blackbox or EdgeTX telemetry stream would have given it.
      expect(flight.minLinkQuality).toBeNull();
    });
  });
});

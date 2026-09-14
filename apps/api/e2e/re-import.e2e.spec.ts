import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { SessionDto } from '@spothub/shared';
import { LogImportStatus } from '@spothub/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type TestApp, createTestApp } from './support/app';
import { importFixture, knownChecksums } from './support/flight-logs';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

const FIXTURE = join(
  __dirname,
  '../src/flight-logs/formats/edgetx/__fixtures__/Air65-2000-01-01-000103.csv',
);
const CHECKSUM = createHash('sha256').update(readFileSync(FIXTURE)).digest('hex');

describe('re-importing a log', () => {
  let testApp: TestApp;
  let user: TestUser;

  beforeAll(async () => {
    testApp = await createTestApp();
    user = await createTestUser(testApp.app, 're-import');
  });

  afterAll(async () => {
    await deleteTestUser(testApp.app, user.id);
    await testApp.close();
  });

  it('counts as imported while its flight is still in the logbook', async () => {
    const batch = await importFixture(testApp, user.accessToken, FIXTURE);
    expect(batch.status).toBe(LogImportStatus.Done);
    expect(batch.flightCount).toBe(1);

    const known = await knownChecksums(testApp, user.accessToken, [CHECKSUM]);
    expect(known).toEqual([CHECKSUM]);
  });

  it('is importable again once every flight it gave is deleted', async () => {
    const sessionsResponse = await request(testApp.server)
      .get('/api/flights/sessions')
      .set('Authorization', `Bearer ${user.accessToken}`);
    const flights = (sessionsResponse.body as SessionDto[]).flatMap(
      (session) => session.flights,
    );
    const flight = flights.find((candidate) =>
      candidate.fileName.includes('Air65-2000-01-01-000103'),
    );
    expect(flight).toBeDefined();

    await request(testApp.server)
      .delete(`/api/flights/${flight?.id ?? ''}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(204);

    const known = await knownChecksums(testApp, user.accessToken, [CHECKSUM]);
    expect(known).toEqual([]);

    // And a second drop of the same file really does import it again, not
    // just report it as new.
    const batch = await importFixture(testApp, user.accessToken, FIXTURE);
    expect(batch.status).toBe(LogImportStatus.Done);
    expect(batch.flightCount).toBe(1);
  });
});

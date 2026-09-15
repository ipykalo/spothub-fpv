import { join } from 'node:path';

import type { SessionDto } from '@spothub/shared';
import { LogFileStatus, LogImportStatus } from '@spothub/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type TestApp, createTestApp } from './support/app';
import { importFixture } from './support/flight-logs';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

const BLACKBOX = join(__dirname, '../src/flight-logs/formats/blackbox/__fixtures__');

describe('blackbox import', () => {
  let testApp: TestApp;
  let user: TestUser;

  beforeAll(async () => {
    testApp = await createTestApp();
    user = await createTestUser(testApp.app, 'blackbox');
  });

  afterAll(async () => {
    await deleteTestUser(testApp.app, user.id);
    await testApp.close();
  });

  it('refuses btfl_all.bbl by name, before anything is uploaded', async () => {
    const response = await request(testApp.server)
      .post('/api/flight-logs/uploads')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        fileName: 'btfl_all.bbl',
        sizeBytes: 16,
        checksum: 'a'.repeat(64),
      });

    expect(response.status).toBe(400);
  });

  it('fails a log with no day to place it on, asking for one', async () => {
    const batch = await importFixture(
      testApp,
      user.accessToken,
      join(BLACKBOX, 'cinelog20', 'btfl_001.bbl'),
      { flownOn: null },
    );

    expect(batch.status).toBe(LogImportStatus.Failed);
    expect(batch.flightCount).toBe(0);
    expect(batch.files).toHaveLength(1);
    expect(batch.files[0].status).toBe(LogFileStatus.Failed);
    expect(batch.files[0].error).toMatch(/pick the day/i);
  });

  it('imports the same log once a day is given, through the real decode-to-CSV path', async () => {
    const batch = await importFixture(
      testApp,
      user.accessToken,
      join(BLACKBOX, 'cinelog20', 'btfl_001.bbl'),
      { flownOn: '2026-09-13' },
    );

    expect(batch.status).toBe(LogImportStatus.Done);
    expect(batch.flightCount).toBe(1);

    const sessionsResponse = await request(testApp.server)
      .get('/api/flights/sessions')
      .set('Authorization', `Bearer ${user.accessToken}`);
    const flights = (sessionsResponse.body as SessionDto[]).flatMap(
      (session) => session.flights,
    );
    const flight = flights.find((candidate) => candidate.fileName === 'btfl_001.bbl');

    expect(flight).toBeDefined();
    expect(flight?.timeRecorded).toBe(false);
    expect(flight?.durationS).toBe(14);
    expect(flight?.minVoltage).toBe(13.01);
    expect(flight?.mahUsed).toBe(17);
  });
});

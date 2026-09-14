import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';

import { PrismaService } from '../../src/prisma';

export interface OwnedFlightFixture {
  readonly buildId: string;
  readonly partId: string;
  readonly batteryUnitId: string;
  readonly flightId: string;
}

/**
 * A build, a battery pack and a flight already in the logbook, built directly
 * through Prisma — the shape a real import leaves behind, without running one.
 * Driving a whole import just to get one flight to test ownership against
 * would test the import pipeline a second time, not ownership; that pipeline
 * has its own spec.
 */
export async function seedOwnedFlight(
  app: INestApplication,
  ownerId: string,
): Promise<OwnedFlightFixture> {
  const prisma = app.get(PrismaService);

  const build = await prisma.build.create({
    data: { ownerId, name: 'e2e build', slug: `e2e-build-${randomUUID()}` },
  });

  const part = await prisma.part.create({ data: { ownerId, category: 'BATTERY' } });
  const unit = await prisma.partUnit.create({ data: { partId: part.id } });

  const logFile = await prisma.logFile.create({
    data: {
      ownerId,
      format: 'EDGETX_CSV',
      status: 'PARSED',
      storageKey: `e2e/${randomUUID()}.csv`,
      fileName: 'e2e-ownership.csv',
      sizeBytes: 1,
      checksum: randomUUID().replaceAll('-', '').padEnd(64, '0'),
    },
  });

  const startedAt = new Date('2026-01-01T00:00:00.000Z');
  const endedAt = new Date('2026-01-01T00:01:00.000Z');

  const session = await prisma.session.create({ data: { ownerId, startedAt, endedAt } });

  const flight = await prisma.flight.create({
    data: {
      ownerId,
      sessionId: session.id,
      buildId: build.id,
      batteryUnitId: unit.id,
      logFileId: logFile.id,
      startedAt,
      endedAt,
      durationS: 60,
      sampleCount: 60,
    },
  });

  return {
    buildId: build.id,
    partId: part.id,
    batteryUnitId: unit.id,
    flightId: flight.id,
  };
}

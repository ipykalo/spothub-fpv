import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma';
import { FlightsRepository } from '../abstract/flights.repository';
import type {
  FlightEntity,
  NewFlightData,
  SessionEntity,
} from '../entities/flight.entity';
import { type PlannedFlight, planSessions } from '../session-planner';

const FLIGHT_INCLUDE = {
  build: { select: { name: true } },
  logFile: { select: { fileName: true, modelName: true } },
} satisfies Prisma.FlightInclude;

type FlightRow = Prisma.FlightGetPayload<{ include: typeof FLIGHT_INCLUDE }>;

/** Placeholder keys for flights not stored yet. A uuid never starts this way. */
const NEW = 'new:';

/** Regrouping a long history is still one statement per changed session. */
const TRANSACTION_TIMEOUT_MS = 60_000;

/** The only place flights and sessions meet Prisma. */
@Injectable()
export class PrismaFlightsRepository extends FlightsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async addFlights(
    ownerId: string,
    flights: readonly NewFlightData[],
    sessionGapMs: number,
  ): Promise<number> {
    if (flights.length === 0) {
      return 0;
    }

    return this.prisma.$transaction(
      async (tx) => {
        const logFileIds = [...new Set(flights.map((flight) => flight.logFileId))];

        // Re-running an import must not duplicate a flight: same log, same
        // take-off is the same flight.
        const stored = await tx.flight.findMany({
          where: { ownerId, logFileId: { in: logFileIds } },
          select: { logFileId: true, startedAt: true },
        });
        const seen = new Set(stored.map((row) => identity(row.logFileId, row.startedAt)));

        const fresh = flights.filter((flight) => {
          const key = identity(flight.logFileId, flight.startedAt);

          if (seen.has(key)) {
            return false;
          }

          seen.add(key);
          return true;
        });

        if (fresh.length > 0) {
          await regroup(tx, ownerId, fresh, sessionGapMs);
        }

        return fresh.length;
      },
      { timeout: TRANSACTION_TIMEOUT_MS },
    );
  }

  async findSessions(ownerId: string): Promise<SessionEntity[]> {
    const sessions = await this.prisma.session.findMany({
      where: { ownerId },
      orderBy: { startedAt: 'desc' },
      include: {
        flights: { orderBy: { startedAt: 'asc' }, include: FLIGHT_INCLUDE },
      },
    });

    return sessions.map((session) => ({
      id: session.id,
      ownerId: session.ownerId,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      flights: session.flights.map(toFlightEntity),
    }));
  }

  async updateBuild(
    ownerId: string,
    flightId: string,
    buildId: string | null,
  ): Promise<FlightEntity | null> {
    const { count } = await this.prisma.flight.updateMany({
      where: { id: flightId, ownerId },
      data: { buildId },
    });

    if (count === 0) {
      return null;
    }

    const flight = await this.prisma.flight.findFirst({
      where: { id: flightId, ownerId },
      include: FLIGHT_INCLUDE,
    });

    return flight ? toFlightEntity(flight) : null;
  }

  async deleteForOwner(
    ownerId: string,
    flightId: string,
    sessionGapMs: number,
  ): Promise<boolean> {
    return this.prisma.$transaction(
      async (tx) => {
        const { count } = await tx.flight.deleteMany({
          where: { id: flightId, ownerId },
        });

        if (count === 0) {
          return false;
        }

        // A deleted flight can split its session, or empty it.
        await regroup(tx, ownerId, [], sessionGapMs);
        return true;
      },
      { timeout: TRANSACTION_TIMEOUT_MS },
    );
  }

  async buildBelongsToOwner(ownerId: string, buildId: string): Promise<boolean> {
    const build = await this.prisma.build.findFirst({
      where: { id: buildId, ownerId },
      select: { id: true },
    });

    return build !== null;
  }

  async findBuildIdByName(ownerId: string, name: string): Promise<string | null> {
    const build = await this.prisma.build.findFirst({
      where: { ownerId, name: { equals: name.trim(), mode: 'insensitive' } },
      select: { id: true },
    });

    return build?.id ?? null;
  }
}

/**
 * Brings the owner's sessions in line with their flights, inserting `incoming`
 * on the way.
 *
 * Every flight is moved before any session is deleted: sessions cascade to
 * their flights, so dropping one that still held a flight would delete it.
 */
async function regroup(
  tx: Prisma.TransactionClient,
  ownerId: string,
  incoming: readonly NewFlightData[],
  sessionGapMs: number,
): Promise<void> {
  const [stored, sessions] = await Promise.all([
    tx.flight.findMany({
      where: { ownerId },
      select: { id: true, startedAt: true, endedAt: true, sessionId: true },
    }),
    tx.session.findMany({
      where: { ownerId },
      select: { id: true, startedAt: true, endedAt: true },
    }),
  ]);

  const planned: PlannedFlight[] = [
    ...stored.map((flight) => ({
      key: flight.id,
      startedAt: flight.startedAt,
      endedAt: flight.endedAt,
      sessionId: flight.sessionId,
    })),
    ...incoming.map((flight, index) => ({
      key: `${NEW}${index}`,
      startedAt: flight.startedAt,
      endedAt: flight.endedAt,
      sessionId: null,
    })),
  ];

  const plan = planSessions(planned, sessionGapMs);
  const currentSession = new Map(stored.map((flight) => [flight.id, flight.sessionId]));
  const bounds = new Map(sessions.map((session) => [session.id, session]));

  for (const group of plan.sessions) {
    let sessionId = group.sessionId;

    if (sessionId === null) {
      const created = await tx.session.create({
        data: { ownerId, startedAt: group.startedAt, endedAt: group.endedAt },
        select: { id: true },
      });
      sessionId = created.id;
    } else {
      const was = bounds.get(sessionId);

      if (
        was?.startedAt.getTime() !== group.startedAt.getTime() ||
        was.endedAt.getTime() !== group.endedAt.getTime()
      ) {
        await tx.session.updateMany({
          where: { id: sessionId, ownerId },
          data: { startedAt: group.startedAt, endedAt: group.endedAt },
        });
      }
    }

    const moving = group.keys.filter(
      (key) => !key.startsWith(NEW) && currentSession.get(key) !== sessionId,
    );

    if (moving.length > 0) {
      await tx.flight.updateMany({
        where: { id: { in: moving }, ownerId },
        data: { sessionId },
      });
    }

    const creating = group.keys
      .filter((key) => key.startsWith(NEW))
      .map((key) => incoming[Number(key.slice(NEW.length))]);

    if (creating.length > 0) {
      const target = sessionId;
      await tx.flight.createMany({
        data: creating.map((flight) => toCreateData(ownerId, target, flight)),
        skipDuplicates: true,
      });
    }
  }

  if (plan.dropped.length > 0) {
    await tx.session.deleteMany({ where: { ownerId, id: { in: [...plan.dropped] } } });
  }

  // A deletion can empty a session the plan never saw, because no flight
  // points at it any more.
  await tx.session.deleteMany({ where: { ownerId, flights: { none: {} } } });
}

function identity(logFileId: string, startedAt: Date): string {
  return `${logFileId}|${startedAt.toISOString()}`;
}

function toCreateData(
  ownerId: string,
  sessionId: string,
  flight: NewFlightData,
): Prisma.FlightCreateManyInput {
  return {
    ownerId,
    sessionId,
    buildId: flight.buildId,
    logFileId: flight.logFileId,
    startedAt: flight.startedAt,
    endedAt: flight.endedAt,
    durationS: flight.durationS,
    sampleCount: flight.sampleCount,
    startVoltage: flight.startVoltage,
    minVoltage: flight.minVoltage,
    endVoltage: flight.endVoltage,
    mahUsed: flight.mahUsed,
    maxCurrentA: flight.maxCurrentA,
    minLinkQuality: flight.minLinkQuality,
    minRssiDbm: flight.minRssiDbm,
    minSnrDb: flight.minSnrDb,
    minDownlinkQuality: flight.minDownlinkQuality,
    maxTxPowerMw: flight.maxTxPowerMw,
    avgThrottlePct: flight.avgThrottlePct,
    maxThrottlePct: flight.maxThrottlePct,
    minRadioVoltage: flight.minRadioVoltage,
    hasGps: flight.hasGps,
    distanceM: flight.distanceM,
    maxAltitudeM: flight.maxAltitudeM,
    maxSpeedKmh: flight.maxSpeedKmh,
    maxHomeDistanceM: flight.maxHomeDistanceM,
  };
}

function toFlightEntity(row: FlightRow): FlightEntity {
  return {
    id: row.id,
    ownerId: row.ownerId,
    sessionId: row.sessionId,
    buildId: row.buildId,
    buildName: row.build?.name ?? null,
    logFileId: row.logFileId,
    fileName: row.logFile.fileName,
    modelName: row.logFile.modelName,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    durationS: row.durationS,
    sampleCount: row.sampleCount,
    startVoltage: row.startVoltage,
    minVoltage: row.minVoltage,
    endVoltage: row.endVoltage,
    mahUsed: row.mahUsed,
    maxCurrentA: row.maxCurrentA,
    minLinkQuality: row.minLinkQuality,
    minRssiDbm: row.minRssiDbm,
    minSnrDb: row.minSnrDb,
    minDownlinkQuality: row.minDownlinkQuality,
    maxTxPowerMw: row.maxTxPowerMw,
    avgThrottlePct: row.avgThrottlePct,
    maxThrottlePct: row.maxThrottlePct,
    minRadioVoltage: row.minRadioVoltage,
    hasGps: row.hasGps,
    distanceM: row.distanceM,
    maxAltitudeM: row.maxAltitudeM,
    maxSpeedKmh: row.maxSpeedKmh,
    maxHomeDistanceM: row.maxHomeDistanceM,
  };
}

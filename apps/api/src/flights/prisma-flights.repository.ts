import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma';
import { FlightsRepository } from './abstract/flights.repository';
import type {
  FlightAssignment,
  FlightEntity,
  NewFlightData,
  SessionEntity,
} from './flight.entity';
import { type PlannedFlight, planSessions } from './session-planner';
import { TRACK_SEARCH_WINDOW_MS, matchTrack } from './track-matcher';

const FLIGHT_INCLUDE = {
  build: { select: { name: true } },
  batteryUnit: {
    select: {
      id: true,
      label: true,
      part: {
        select: {
          manufacturer: true,
          model: true,
          // The order the parts module numbers units in, so "#2" here is the
          // same pack as "#2" on the part's own page.
          units: { select: { id: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        },
      },
    },
  },
  logFile: { select: { fileName: true, modelName: true } },
} satisfies Prisma.FlightInclude;

type FlightRow = Prisma.FlightGetPayload<{ include: typeof FLIGHT_INCLUDE }>;
type BatteryUnitRow = NonNullable<FlightRow['batteryUnit']>;

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

    return this.prisma.$transaction((tx) => storeNew(tx, ownerId, flights, sessionGapMs), {
      timeout: TRANSACTION_TIMEOUT_MS,
    });
  }

  async addTracks(
    ownerId: string,
    tracks: readonly NewFlightData[],
    sessionGapMs: number,
  ): Promise<number> {
    if (tracks.length === 0) {
      return 0;
    }

    return this.prisma.$transaction(
      async (tx) => {
        const unmatched: NewFlightData[] = [];
        let joined = 0;

        for (const track of tracks) {
          const candidates = await tx.flight.findMany({
            where: {
              ownerId,
              // A blackbox flight's times only order its day, so nothing lines up with them.
              timeRecorded: true,
              // A retry must not join a track to the flight it was stored as last time.
              logFileId: { not: track.logFileId },
              startedAt: {
                gte: new Date(track.startedAt.getTime() - TRACK_SEARCH_WINDOW_MS),
                lte: new Date(track.startedAt.getTime() + TRACK_SEARCH_WINDOW_MS),
              },
            },
            select: { id: true, startedAt: true, endedAt: true, hasGps: true, trackLogFileId: true },
          });

          const match = matchTrack(track, candidates);
          const flight = candidates.find((candidate) => candidate.id === match?.flightId);

          if (!flight) {
            unmatched.push(track);
            continue;
          }

          await tx.flight.updateMany({
            where: { id: flight.id, ownerId },
            data: {
              // The radio log's own GPS stays; a track only fills a flight that had none.
              ...(flight.hasGps ? {} : trackFigures(track)),
              ...(flight.trackLogFileId === null ? { trackLogFileId: track.logFileId } : {}),
            },
          });
          joined += 1;
        }

        return joined + (await storeNew(tx, ownerId, unmatched, sessionGapMs));
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

  async updateAssignment(
    ownerId: string,
    flightIds: readonly string[],
    change: FlightAssignment,
  ): Promise<FlightEntity[] | null> {
    const ids = [...new Set(flightIds)];

    return this.prisma.$transaction(async (tx) => {
      // All or none: a bulk change that names a flight which is not the
      // owner's changes nothing, rather than quietly changing the rest.
      const owned = await tx.flight.count({ where: { id: { in: ids }, ownerId } });

      if (owned !== ids.length) {
        return null;
      }

      // An undefined key is left out of the update, so it keeps its value.
      await tx.flight.updateMany({
        where: { id: { in: ids }, ownerId },
        data: { buildId: change.buildId, batteryUnitId: change.batteryUnitId },
      });

      const rows = await tx.flight.findMany({
        where: { id: { in: ids }, ownerId },
        orderBy: { startedAt: 'asc' },
        include: FLIGHT_INCLUDE,
      });

      return rows.map(toFlightEntity);
    });
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

  async batteryBelongsToOwner(ownerId: string, unitId: string): Promise<boolean> {
    const unit = await this.prisma.partUnit.findFirst({
      where: { id: unitId, part: { ownerId, category: 'BATTERY' } },
      select: { id: true },
    });

    return unit !== null;
  }

  async findBuildIdByName(ownerId: string, name: string): Promise<string | null> {
    const wanted = comparable(name);
    const builds = await this.prisma.build.findMany({
      where: { ownerId },
      select: { id: true, name: true },
    });
    const matches = builds.filter((build) => comparable(build.name) === wanted);

    // Two builds that read the same would make any choice a guess.
    return wanted.length > 0 && matches.length === 1 ? matches[0].id : null;
  }
}

/**
 * Stores the flights not stored yet and regroups the sessions around them.
 * Answers how many were new.
 */
async function storeNew(
  tx: Prisma.TransactionClient,
  ownerId: string,
  flights: readonly NewFlightData[],
  sessionGapMs: number,
): Promise<number> {
  if (flights.length === 0) {
    return 0;
  }

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
}

/** What a GPS track gives a flight that had no GPS of its own. */
function trackFigures(track: NewFlightData): Prisma.FlightUpdateManyMutationInput {
  return {
    hasGps: track.hasGps,
    distanceM: track.distanceM,
    maxAltitudeM: track.maxAltitudeM,
    maxSpeedKmh: track.maxSpeedKmh,
    maxHomeDistanceM: track.maxHomeDistanceM,
  };
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

/** Named as the parts page names a unit: the part, then its label or its number. */
function batteryName(unit: BatteryUnitRow): string {
  const part = [unit.part.manufacturer, unit.part.model].filter(Boolean).join(' ') || 'Battery';
  return `${part} ${unitLabel(unit)}`;
}

function unitLabel(unit: BatteryUnitRow): string {
  if (unit.label) {
    return unit.label;
  }

  const index = unit.part.units.findIndex((candidate) => candidate.id === unit.id);
  return `#${String(index + 1)}`;
}

/** A name as a person reads it: without case, and without spaces — "Cinelog  20" is Cinelog20. */
function comparable(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '');
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
    timeRecorded: flight.timeRecorded,
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
    batteryUnitId: row.batteryUnitId,
    batteryName: row.batteryUnit ? batteryName(row.batteryUnit) : null,
    logFileId: row.logFileId,
    fileName: row.logFile.fileName,
    modelName: row.logFile.modelName,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    durationS: row.durationS,
    sampleCount: row.sampleCount,
    timeRecorded: row.timeRecorded,
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

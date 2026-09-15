import type { FlightDto, SessionDto } from '@spothub/shared';

import type { FlightEntity, SessionEntity } from './flight.entity';

export function toFlightDto(flight: FlightEntity): FlightDto {
  return {
    id: flight.id,
    sessionId: flight.sessionId,
    buildId: flight.buildId,
    buildName: flight.buildName,
    batteryUnitId: flight.batteryUnitId,
    batteryName: flight.batteryName,
    modelName: flight.modelName,
    fileName: flight.fileName,
    startedAt: flight.startedAt.toISOString(),
    endedAt: flight.endedAt.toISOString(),
    timeRecorded: flight.timeRecorded,
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

export function toSessionDto(session: SessionEntity): SessionDto {
  return {
    id: session.id,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt.toISOString(),
    timeRecorded: session.flights.every((flight) => flight.timeRecorded),
    flightCount: session.flights.length,
    totalDurationS: session.flights.reduce((sum, flight) => sum + flight.durationS, 0),
    flights: session.flights.map(toFlightDto),
  };
}

import type { ParsedFlight } from '../edgetx-csv.parser';

/** One flight, as the domain understands it — no ORM types. */
export interface FlightEntity {
  readonly id: string;
  readonly ownerId: string;
  readonly sessionId: string;
  readonly buildId: string | null;
  readonly buildName: string | null;
  readonly logFileId: string;
  readonly fileName: string;
  readonly modelName: string | null;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly durationS: number;
  readonly sampleCount: number;
  readonly startVoltage: number | null;
  readonly minVoltage: number | null;
  readonly endVoltage: number | null;
  readonly mahUsed: number | null;
  readonly maxCurrentA: number | null;
  readonly minLinkQuality: number | null;
  readonly minRssiDbm: number | null;
  readonly minSnrDb: number | null;
  readonly minDownlinkQuality: number | null;
  readonly maxTxPowerMw: number | null;
  readonly avgThrottlePct: number | null;
  readonly maxThrottlePct: number | null;
  readonly minRadioVoltage: number | null;
  readonly hasGps: boolean;
  readonly distanceM: number | null;
  readonly maxAltitudeM: number | null;
  readonly maxSpeedKmh: number | null;
  readonly maxHomeDistanceM: number | null;
}

/** One outing, with its flights in the order they were flown. */
export interface SessionEntity {
  readonly id: string;
  readonly ownerId: string;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly flights: readonly FlightEntity[];
}

/** A parsed flight on its way into storage. */
export interface NewFlightData extends ParsedFlight {
  readonly logFileId: string;
  readonly buildId: string | null;
}

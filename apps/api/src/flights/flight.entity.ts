/**
 * What a log says about one flight, whatever its format: the figures a parser
 * produces and a flight keeps. `flight-logs` fills them in; the shape lives
 * here, because it is what the logbook stores.
 */
export interface FlightFigures {
  readonly startedAt: Date;
  readonly endedAt: Date;
  /**
   * False when the log records no time of day — a blackbox log, placed on the
   * day it was said to be flown. Its times then only order its flights.
   */
  readonly timeRecorded: boolean;
  readonly durationS: number;
  readonly sampleCount: number;
  readonly startVoltage: number | null;
  readonly minVoltage: number | null;
  readonly endVoltage: number | null;
  readonly mahUsed: number | null;
  readonly maxCurrentA: number | null;
  readonly minLinkQuality: number | null;
  /** The weakest signal the receiver heard, in dBm, on its better antenna. */
  readonly minRssiDbm: number | null;
  readonly minSnrDb: number | null;
  /** The telemetry link back from the quad, as the radio measured it. */
  readonly minDownlinkQuality: number | null;
  readonly maxTxPowerMw: number | null;
  /** Where the throttle stick sat, 0–100 %: the stick, not the motors. */
  readonly avgThrottlePct: number | null;
  readonly maxThrottlePct: number | null;
  /** The radio's own battery. */
  readonly minRadioVoltage: number | null;
  readonly hasGps: boolean;
  readonly distanceM: number | null;
  readonly maxAltitudeM: number | null;
  readonly maxSpeedKmh: number | null;
  readonly maxHomeDistanceM: number | null;
}

/** One flight, as the domain understands it — no ORM types. */
export interface FlightEntity extends FlightFigures {
  readonly id: string;
  readonly ownerId: string;
  readonly sessionId: string;
  readonly buildId: string | null;
  readonly buildName: string | null;
  readonly batteryUnitId: string | null;
  readonly batteryName: string | null;
  readonly logFileId: string;
  readonly fileName: string;
  readonly modelName: string | null;
}

/** One outing, with its flights in the order they were flown. */
export interface SessionEntity {
  readonly id: string;
  readonly ownerId: string;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly flights: readonly FlightEntity[];
}

/** What flights were flown on. An absent key is left as it is; null clears it. */
export interface FlightAssignment {
  readonly buildId?: string | null | undefined;
  readonly batteryUnitId?: string | null | undefined;
}

/** A parsed flight on its way into storage. */
export interface NewFlightData extends FlightFigures {
  readonly logFileId: string;
  readonly buildId: string | null;
}

import type {
  FlightAssignment,
  FlightEntity,
  NewFlightData,
  SessionEntity,
} from '../entities/flight.entity';

/**
 * Persistence contract for flights and the sessions that group them.
 *
 * Sessions are derived, so every write that can change the grouping — adding
 * flights, deleting one — regroups the owner's sessions in the same
 * transaction. A flight is never left without a session, and no session is
 * left without flights.
 *
 * Builds and battery packs are reached by a join inside this repository, as
 * media reaches builds for photos, so this module depends on no feature
 * module.
 */
export abstract class FlightsRepository {
  /** Stores the flights, skipping any already stored; answers how many were new. */
  abstract addFlights(
    ownerId: string,
    flights: readonly NewFlightData[],
    sessionGapMs: number,
  ): Promise<number>;

  /** Every session, newest first, each with its flights in flying order. */
  abstract findSessions(ownerId: string): Promise<SessionEntity[]>;

  /**
   * Sets the build or battery pack on every one of these flights and answers
   * them in flying order — or null, changing nothing, when any of them is not
   * the owner's.
   */
  abstract updateAssignment(
    ownerId: string,
    flightIds: readonly string[],
    change: FlightAssignment,
  ): Promise<FlightEntity[] | null>;

  abstract deleteForOwner(
    ownerId: string,
    flightId: string,
    sessionGapMs: number,
  ): Promise<boolean>;

  abstract buildBelongsToOwner(ownerId: string, buildId: string): Promise<boolean>;

  /** True when the unit is the owner's and a unit of a battery part. */
  abstract batteryBelongsToOwner(ownerId: string, unitId: string): Promise<boolean>;

  /**
   * The owner's build with this name, ignoring case and spaces — or null when
   * none matches, or more than one does.
   */
  abstract findBuildIdByName(ownerId: string, name: string): Promise<string | null>;
}

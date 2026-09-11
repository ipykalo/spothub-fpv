import type {
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
 * Builds are reached by a join inside this repository, as media reaches them
 * for photos, so this module depends on no feature module.
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

  abstract updateBuild(
    ownerId: string,
    flightId: string,
    buildId: string | null,
  ): Promise<FlightEntity | null>;

  abstract deleteForOwner(
    ownerId: string,
    flightId: string,
    sessionGapMs: number,
  ): Promise<boolean>;

  abstract buildBelongsToOwner(ownerId: string, buildId: string): Promise<boolean>;

  /** The owner's build with exactly this name, ignoring case — or null. */
  abstract findBuildIdByName(ownerId: string, name: string): Promise<string | null>;
}

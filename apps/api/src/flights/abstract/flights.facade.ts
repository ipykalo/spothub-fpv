import type { NewFlightData } from '../flight.entity';

/**
 * What other modules may ask of the logbook — the flights module's public API.
 *
 * Today that is `flight-logs`, which turns uploaded logs into flights but
 * never writes a flight or a session itself: sessions are regrouped on every
 * write, and only this module knows how.
 */
export abstract class FlightsFacade {
  /**
   * Stores the flights, skipping any already stored, and regroups the owner's
   * sessions around them. Answers how many were new.
   */
  abstract addFlights(
    ownerId: string,
    flights: readonly NewFlightData[],
  ): Promise<number>;

  /**
   * Adds GPS tracks to the flights they overlap — allowing for a radio clock
   * set to another time zone — and stores each track that overlaps none as a
   * flight of its own. A flight that already has GPS keeps it; the track's
   * file is linked to it either way. Answers how many flights the tracks went
   * into, new or existing.
   */
  abstract addTracks(ownerId: string, tracks: readonly NewFlightData[]): Promise<number>;

  abstract buildBelongsToOwner(ownerId: string, buildId: string): Promise<boolean>;

  /**
   * The owner's build with this name, ignoring case and spaces — or null when
   * none matches, or more than one does.
   */
  abstract findBuildIdByName(ownerId: string, name: string): Promise<string | null>;
}

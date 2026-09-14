import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  FlightDto,
  SessionDto,
  UpdateFlightDto,
  UpdateFlightsDto,
} from '@spothub/shared';

import { FlightsRepository } from './abstract/flights.repository';
import type { FlightAssignment } from './flight.entity';
import { SESSION_GAP_MS } from './flights.constants';
import { toFlightDto, toSessionDto } from './flights.mapper';

/** Business rules for flights once they are in. */
@Injectable()
export class FlightsService {
  constructor(private readonly flights: FlightsRepository) {}

  async sessions(ownerId: string): Promise<SessionDto[]> {
    const sessions = await this.flights.findSessions(ownerId);
    return sessions.map(toSessionDto);
  }

  /** Sets a flight's build or battery pack; null takes it off. */
  async update(ownerId: string, id: string, input: UpdateFlightDto): Promise<FlightDto> {
    const [flight] = await this.assign(ownerId, [id], input, 'Flight not found');
    return flight;
  }

  /** The same change across many flights: all of them, or none. */
  async updateMany(ownerId: string, input: UpdateFlightsDto): Promise<FlightDto[]> {
    const { flightIds, ...change } = input;
    return this.assign(ownerId, flightIds, change, 'Some of those flights were not found');
  }

  /** The session it was in is regrouped: it may split, or disappear. */
  async remove(ownerId: string, id: string): Promise<void> {
    const deleted = await this.flights.deleteForOwner(ownerId, id, SESSION_GAP_MS);

    if (!deleted) {
      throw new NotFoundException('Flight not found');
    }
  }

  /**
   * A build or pack is checked before anything is written, so naming one that
   * is not the owner's — or a unit that is not a battery — changes nothing.
   */
  private async assign(
    ownerId: string,
    flightIds: readonly string[],
    change: FlightAssignment,
    missing: string,
  ): Promise<FlightDto[]> {
    if (
      typeof change.buildId === 'string' &&
      !(await this.flights.buildBelongsToOwner(ownerId, change.buildId))
    ) {
      throw new NotFoundException('Build not found');
    }

    if (
      typeof change.batteryUnitId === 'string' &&
      !(await this.flights.batteryBelongsToOwner(ownerId, change.batteryUnitId))
    ) {
      throw new NotFoundException('Battery pack not found');
    }

    const flights = await this.flights.updateAssignment(ownerId, flightIds, change);

    if (!flights) {
      throw new NotFoundException(missing);
    }

    return flights.map(toFlightDto);
  }
}

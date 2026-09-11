import { Injectable, NotFoundException } from '@nestjs/common';
import type { FlightDto, SessionDto, UpdateFlightDto } from '@spothub/shared';

import { FlightsRepository } from '../abstract/flights.repository';
import { SESSION_GAP_MS } from '../flights.constants';
import { toFlightDto, toSessionDto } from '../flights.mapper';

/** Business rules for flights once they are in. */
@Injectable()
export class FlightsService {
  constructor(private readonly flights: FlightsRepository) {}

  async sessions(ownerId: string): Promise<SessionDto[]> {
    const sessions = await this.flights.findSessions(ownerId);
    return sessions.map(toSessionDto);
  }

  /** Puts a flight on a build, or takes it off with null. */
  async update(ownerId: string, id: string, input: UpdateFlightDto): Promise<FlightDto> {
    if (
      input.buildId !== null &&
      !(await this.flights.buildBelongsToOwner(ownerId, input.buildId))
    ) {
      throw new NotFoundException('Build not found');
    }

    const flight = await this.flights.updateBuild(ownerId, id, input.buildId);

    if (!flight) {
      throw new NotFoundException('Flight not found');
    }

    return toFlightDto(flight);
  }

  /** The session it was in is regrouped: it may split, or disappear. */
  async remove(ownerId: string, id: string): Promise<void> {
    const deleted = await this.flights.deleteForOwner(ownerId, id, SESSION_GAP_MS);

    if (!deleted) {
      throw new NotFoundException('Flight not found');
    }
  }
}

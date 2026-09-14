import { Injectable } from '@nestjs/common';

import { FlightsFacade } from './abstract/flights.facade';
import { FlightsRepository } from './abstract/flights.repository';
import type { NewFlightData } from './flight.entity';
import { SESSION_GAP_MS } from './flights.constants';

@Injectable()
export class FlightsFacadeImpl extends FlightsFacade {
  constructor(private readonly flights: FlightsRepository) {
    super();
  }

  addFlights(ownerId: string, flights: readonly NewFlightData[]): Promise<number> {
    return this.flights.addFlights(ownerId, flights, SESSION_GAP_MS);
  }

  buildBelongsToOwner(ownerId: string, buildId: string): Promise<boolean> {
    return this.flights.buildBelongsToOwner(ownerId, buildId);
  }

  findBuildIdByName(ownerId: string, name: string): Promise<string | null> {
    return this.flights.findBuildIdByName(ownerId, name);
  }
}

import { Module } from '@nestjs/common';

import { FlightsFacade } from './abstract/flights.facade';
import { FlightsRepository } from './abstract/flights.repository';
import { FlightsController } from './flights.controller';
import { FlightsFacadeImpl } from './flights.facade.impl';
import { FlightsService } from './flights.service';
import { PrismaFlightsRepository } from './prisma-flights.repository';

/**
 * Flights: the logbook — the flights, the sessions that group them, and the
 * build and battery pack each was flown on.
 *
 * Sessions live here rather than in a module of their own because, until V2
 * gives them a spot and notes, they are nothing but a grouping of flights —
 * the way units and sources live inside `parts`. Builds and packs are reached
 * by a join inside this module's own repository, as media reaches builds for
 * photos, so it depends on no feature module.
 *
 * Getting logs in is `flight-logs`, which reaches this module only through
 * `FlightsFacade`.
 */
@Module({
  controllers: [FlightsController],
  providers: [
    FlightsService,
    { provide: FlightsRepository, useClass: PrismaFlightsRepository },
    { provide: FlightsFacade, useClass: FlightsFacadeImpl },
  ],
  exports: [FlightsFacade],
})
export class FlightsModule {}

import { Module } from '@nestjs/common';

import { JobsModule } from '../jobs';
import { StorageModule } from '../storage';
import { FlightLogsRepository } from './abstract/flight-logs.repository';
import { FlightsRepository } from './abstract/flights.repository';
import { FlightLogsController } from './controllers/flight-logs.controller';
import { FlightsController } from './controllers/flights.controller';
import { FlightLogWorker } from './flight-log.worker';
import { PrismaFlightLogsRepository } from './repositories/prisma-flight-logs.repository';
import { PrismaFlightsRepository } from './repositories/prisma-flights.repository';
import { FlightLogsService } from './services/flight-logs.service';
import { FlightsService } from './services/flights.service';

/**
 * Flights: log import, the flights it finds, and the sessions that group them.
 *
 * Sessions live here rather than in a module of their own because, until V2
 * gives them a spot and notes, they are nothing but a grouping of flights —
 * the way units and sources live inside `parts`. Depends on no feature
 * module: a build is reached by a join inside this module's own repository,
 * as media reaches one for photos. Only infrastructure is imported.
 */
@Module({
  imports: [JobsModule, StorageModule],
  controllers: [FlightLogsController, FlightsController],
  providers: [
    FlightLogsService,
    FlightsService,
    FlightLogWorker,
    { provide: FlightLogsRepository, useClass: PrismaFlightLogsRepository },
    { provide: FlightsRepository, useClass: PrismaFlightsRepository },
  ],
})
export class FlightsModule {}

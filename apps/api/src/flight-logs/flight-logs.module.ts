import { Module } from '@nestjs/common';

import { FlightsModule } from '../flights';
import { JobsModule } from '../jobs';
import { StorageModule } from '../storage';
import { BlackboxDecoder } from './abstract/blackbox-decoder';
import { FlightLogsRepository } from './abstract/flight-logs.repository';
import { FlightLogImportJob } from './flight-log-import.job';
import { FlightLogsController } from './flight-logs.controller';
import { FlightLogsService } from './flight-logs.service';
import { BlackboxReader } from './formats/blackbox/blackbox.reader';
import { ProcessBlackboxDecoder } from './formats/blackbox/process-blackbox-decoder';
import { EdgeTxReader } from './formats/edgetx/edgetx.reader';
import { LogReaders } from './formats/log-readers';
import { PrismaFlightLogsRepository } from './prisma-flight-logs.repository';

/**
 * Flight logs: getting logs in — uploads, the import job, and a reader per
 * log format under `formats/`.
 *
 * Flights and sessions belong to `flights`, which this module reaches only
 * through `FlightsFacade`. Knowing whether a log's flights are still in the
 * logbook is a join inside this module's own repository, not a facade call.
 */
@Module({
  imports: [FlightsModule, JobsModule, StorageModule],
  controllers: [FlightLogsController],
  providers: [
    FlightLogsService,
    FlightLogImportJob,
    LogReaders,
    EdgeTxReader,
    BlackboxReader,
    { provide: FlightLogsRepository, useClass: PrismaFlightLogsRepository },
    { provide: BlackboxDecoder, useClass: ProcessBlackboxDecoder },
  ],
})
export class FlightLogsModule {}

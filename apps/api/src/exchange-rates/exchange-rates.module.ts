import { Module } from '@nestjs/common';

import { JobsModule } from '../jobs';
import { ExchangeRatesFacade } from './abstract/exchange-rates.facade';
import { ExchangeRatesRepository } from './abstract/exchange-rates.repository';
import { RateSource } from './abstract/rate-source';
import { ExchangeRatesFacadeImpl } from './exchange-rates.facade.impl';
import { NbuRateSource } from './nbu-rate-source';
import { PrismaExchangeRatesRepository } from './prisma-exchange-rates.repository';
import { RatesFetchJob } from './rates-fetch.job';

/**
 * Official exchange rates, and adding up prices paid in different currencies
 * with them. Depends on no feature module; `ExchangeRatesFacade` is the only
 * provider exported.
 */
@Module({
  imports: [JobsModule],
  providers: [
    RatesFetchJob,
    { provide: RateSource, useClass: NbuRateSource },
    { provide: ExchangeRatesRepository, useClass: PrismaExchangeRatesRepository },
    { provide: ExchangeRatesFacade, useClass: ExchangeRatesFacadeImpl },
  ],
  exports: [ExchangeRatesFacade],
})
export class ExchangeRatesModule {}

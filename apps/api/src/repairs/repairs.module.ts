import { Module } from '@nestjs/common';

import { RepairsFacade } from './abstract/repairs.facade';
import { RepairsRepository } from './abstract/repairs.repository';
import { RepairsController } from './repairs.controller';
import { RepairsFacadeImpl } from './repairs.facade.impl';
import { PrismaRepairsRepository } from './prisma-repairs.repository';
import { RepairsService } from './repairs.service';

/**
 * The crash log: what broke, when, and what putting it right cost.
 *
 * Depends on no other feature module, which is deliberate — `build-parts`
 * depends on this one, so an edge in the other direction would close a cycle.
 * `RepairsFacade` is the only provider exported.
 */
@Module({
  controllers: [RepairsController],
  providers: [
    RepairsService,
    { provide: RepairsRepository, useClass: PrismaRepairsRepository },
    { provide: RepairsFacade, useClass: RepairsFacadeImpl },
  ],
  exports: [RepairsFacade],
})
export class RepairsModule {}

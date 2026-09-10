import { Module } from '@nestjs/common';

import { PartsModule } from '../parts';
import { RepairsModule } from '../repairs';
import { BuildPartsRepository } from './abstract/build-parts.repository';
import { BuildPartsController } from './build-parts.controller';
import { PrismaBuildPartsRepository } from './prisma-build-parts.repository';
import { BuildPartsService } from './build-parts.service';

/**
 * Which units are fitted to which quad, and what that has cost.
 *
 * The only module with feature dependencies, and both point one way: it asks
 * `PartsFacade` what a unit is and `RepairsFacade` whether a repair is real.
 * Neither of those modules depends on this one, so the graph stays acyclic and
 * there is no `forwardRef()` here.
 */
@Module({
  imports: [PartsModule, RepairsModule],
  controllers: [BuildPartsController],
  providers: [
    BuildPartsService,
    { provide: BuildPartsRepository, useClass: PrismaBuildPartsRepository },
  ],
})
export class BuildPartsModule {}

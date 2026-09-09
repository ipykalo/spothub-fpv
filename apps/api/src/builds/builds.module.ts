import { Module } from '@nestjs/common';

import { BuildPartsController } from './build-parts.controller';
import { BuildPartsRepository } from './build-parts.repository';
import { BuildPartsService } from './build-parts.service';
import { BuildsController } from './builds.controller';
import { BuildsRepository } from './builds.repository';
import { BuildsService } from './builds.service';
import { PrismaBuildPartsRepository } from './prisma-build-parts.repository';
import { PrismaBuildsRepository } from './prisma-builds.repository';
import { PrismaRepairsRepository } from './prisma-repairs.repository';
import { RepairsController } from './repairs.controller';
import { RepairsRepository } from './repairs.repository';
import { RepairsService } from './repairs.service';

@Module({
  controllers: [BuildsController, BuildPartsController, RepairsController],
  providers: [
    BuildsService,
    BuildPartsService,
    RepairsService,
    { provide: BuildsRepository, useClass: PrismaBuildsRepository },
    { provide: BuildPartsRepository, useClass: PrismaBuildPartsRepository },
    { provide: RepairsRepository, useClass: PrismaRepairsRepository },
  ],
})
export class BuildsModule {}

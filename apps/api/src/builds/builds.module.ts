import { Module } from '@nestjs/common';

import { BuildPartsController } from './build-parts.controller';
import { BuildPartsRepository } from './build-parts.repository';
import { BuildPartsService } from './build-parts.service';
import { BuildsController } from './builds.controller';
import { BuildsRepository } from './builds.repository';
import { BuildsService } from './builds.service';
import { PrismaBuildPartsRepository } from './prisma-build-parts.repository';
import { PrismaBuildsRepository } from './prisma-builds.repository';

@Module({
  controllers: [BuildsController, BuildPartsController],
  providers: [
    BuildsService,
    BuildPartsService,
    { provide: BuildsRepository, useClass: PrismaBuildsRepository },
    { provide: BuildPartsRepository, useClass: PrismaBuildPartsRepository },
  ],
})
export class BuildsModule {}

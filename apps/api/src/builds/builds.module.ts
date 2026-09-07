import { Module } from '@nestjs/common';

import { BuildsController } from './builds.controller';
import { BuildsRepository } from './builds.repository';
import { BuildsService } from './builds.service';
import { PrismaBuildsRepository } from './prisma-builds.repository';

@Module({
  controllers: [BuildsController],
  providers: [
    BuildsService,
    { provide: BuildsRepository, useClass: PrismaBuildsRepository },
  ],
})
export class BuildsModule {}

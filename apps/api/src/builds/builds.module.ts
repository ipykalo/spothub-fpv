import { Module } from '@nestjs/common';

import { BuildsRepository } from './abstract/builds.repository';
import { BuildsController } from './builds.controller';
import { PrismaBuildsRepository } from './prisma-builds.repository';
import { BuildsService } from './builds.service';

/**
 * The hangar: the quads themselves.
 *
 * What is fitted to one, what broke on it and what firmware it ran are three
 * other modules. They reach a build only through an ownership join in their
 * own repositories, so this module has no dependents and no dependencies.
 */
@Module({
  controllers: [BuildsController],
  providers: [
    BuildsService,
    { provide: BuildsRepository, useClass: PrismaBuildsRepository },
  ],
})
export class BuildsModule {}

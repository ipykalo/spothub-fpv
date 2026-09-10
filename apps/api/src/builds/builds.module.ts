import { Module } from '@nestjs/common';

import { MediaModule } from '../media';
import { BuildsRepository } from './abstract/builds.repository';
import { BuildsController } from './builds.controller';
import { PrismaBuildsRepository } from './prisma-builds.repository';
import { BuildsService } from './builds.service';

/**
 * The hangar: the quads themselves.
 *
 * What is fitted to one, what broke on it and what firmware it ran are three
 * other modules. They reach a build only through an ownership join in their
 * own repositories, so nothing depends on this module.
 */
@Module({
  // For MediaFacade only: a build card shows its cover photo. Media depends on
  // no feature module, so this edge does not close a cycle.
  imports: [MediaModule],
  controllers: [BuildsController],
  providers: [
    BuildsService,
    { provide: BuildsRepository, useClass: PrismaBuildsRepository },
  ],
})
export class BuildsModule {}

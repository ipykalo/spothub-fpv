import { Module } from '@nestjs/common';

import { MediaModule } from '../media';
import { BuildsFacade } from './abstract/builds.facade';
import { BuildsRepository } from './abstract/builds.repository';
import { BuildsController } from './builds.controller';
import { BuildsFacadeImpl } from './builds.facade.impl';
import { PrismaBuildsRepository } from './prisma-builds.repository';
import { BuildsService } from './builds.service';

/**
 * The hangar: the quads themselves.
 *
 * What is fitted to one, what broke on it and what firmware it ran are three
 * other modules. They reach a build only through a join in their own
 * repositories, so they do not depend on this module. `comments` does, through
 * `BuildsFacade` — the only provider exported.
 */
@Module({
  // For MediaFacade only: a build card shows its cover photo. Media depends on
  // no feature module, so this edge does not close a cycle.
  imports: [MediaModule],
  controllers: [BuildsController],
  providers: [
    BuildsService,
    { provide: BuildsRepository, useClass: PrismaBuildsRepository },
    { provide: BuildsFacade, useClass: BuildsFacadeImpl },
  ],
  exports: [BuildsFacade],
})
export class BuildsModule {}

import { Module } from '@nestjs/common';

import { LikesModule } from '../likes';
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
 * repositories, so they do not depend on this module. `comments` and `posts`
 * do, through `BuildsFacade` — the only provider exported.
 */
@Module({
  // MediaFacade for a card's cover photo, LikesFacade for its likes. Neither
  // depends on a feature module, so these edges do not close a cycle.
  imports: [MediaModule, LikesModule],
  controllers: [BuildsController],
  providers: [
    BuildsService,
    { provide: BuildsRepository, useClass: PrismaBuildsRepository },
    { provide: BuildsFacade, useClass: BuildsFacadeImpl },
  ],
  exports: [BuildsFacade],
})
export class BuildsModule {}

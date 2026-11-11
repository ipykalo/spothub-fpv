import { Module } from '@nestjs/common';

import { BuildVideosRepository } from './abstract/build-videos.repository';
import { BuildVideosController } from './build-videos.controller';
import { BuildVideosService } from './build-videos.service';
import { PrismaBuildVideosRepository } from './prisma-build-videos.repository';

/**
 * YouTube videos on a build. Depends on no other feature module: who may
 * read a build is a join on `builds` inside its own repository, as repairs
 * and photos do. Nothing is exported, because nothing else needs it.
 */
@Module({
  controllers: [BuildVideosController],
  providers: [
    BuildVideosService,
    { provide: BuildVideosRepository, useClass: PrismaBuildVideosRepository },
  ],
})
export class BuildVideosModule {}

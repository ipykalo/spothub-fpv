import { Module } from '@nestjs/common';

import { JobsModule } from '../jobs';
import { StorageModule } from '../storage';
import { YouTubeModule } from '../youtube';
import { BuildVideosRepository } from './abstract/build-videos.repository';
import { BuildVideoCoverJob } from './build-video-cover.job';
import { BuildVideosController } from './build-videos.controller';
import { BuildVideosService } from './build-videos.service';
import { PrismaBuildVideosRepository } from './prisma-build-videos.repository';

/**
 * YouTube videos on a build, each with a cover made from its thumbnail and
 * kept in our storage. Depends on no other feature module: who may read a
 * build is a join on `builds` inside its own repository, as repairs and
 * photos do, and the job queue, storage and YouTube's thumbnails are
 * infrastructure. Nothing is exported, because nothing else needs it.
 */
@Module({
  imports: [JobsModule, StorageModule, YouTubeModule],
  controllers: [BuildVideosController],
  providers: [
    BuildVideosService,
    BuildVideoCoverJob,
    { provide: BuildVideosRepository, useClass: PrismaBuildVideosRepository },
  ],
})
export class BuildVideosModule {}

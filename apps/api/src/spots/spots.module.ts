import { Module } from '@nestjs/common';

import { JobsModule } from '../jobs';
import { StorageModule } from '../storage';
import { SpotsFacade } from './abstract/spots.facade';
import { SpotsRepository } from './abstract/spots.repository';
import { YouTubeThumbnails } from './abstract/youtube-thumbnails';
import { HttpYouTubeThumbnails } from './http-youtube-thumbnails';
import { PrismaSpotsRepository } from './prisma-spots.repository';
import { SpotCoverJob } from './spot-cover.job';
import { SpotsController } from './spots.controller';
import { SpotsFacadeImpl } from './spots.facade.impl';
import { SpotsService } from './spots.service';

/**
 * Places to fly: coordinates, the ground, the rules of the place, and a
 * flight video whose thumbnail becomes the spot's cover.
 *
 * Kept apart from `flights` on purpose. A spot is somewhere, written by hand;
 * a flight is something that happened, read from a log. Nothing here depends
 * on another feature module — only on the job queue and storage, which are
 * infrastructure. `spot-comments` depends on this one, through `SpotsFacade`,
 * the only provider exported.
 */
@Module({
  imports: [JobsModule, StorageModule],
  controllers: [SpotsController],
  providers: [
    SpotsService,
    SpotCoverJob,
    { provide: SpotsRepository, useClass: PrismaSpotsRepository },
    { provide: YouTubeThumbnails, useClass: HttpYouTubeThumbnails },
    { provide: SpotsFacade, useClass: SpotsFacadeImpl },
  ],
  exports: [SpotsFacade],
})
export class SpotsModule {}

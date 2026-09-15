import { Module } from '@nestjs/common';

import { JobsModule } from '../jobs';
import { StorageModule } from '../storage';
import { SpotsRepository } from './abstract/spots.repository';
import { YouTubeThumbnails } from './abstract/youtube-thumbnails';
import { HttpYouTubeThumbnails } from './http-youtube-thumbnails';
import { PrismaSpotsRepository } from './prisma-spots.repository';
import { SpotCoverJob } from './spot-cover.job';
import { SpotsController } from './spots.controller';
import { SpotsService } from './spots.service';

/**
 * Places to fly: coordinates, the ground, the rules of the place, and a
 * flight video whose thumbnail becomes the spot's cover.
 *
 * Kept apart from `flights` on purpose. A spot is somewhere, written by hand;
 * a flight is something that happened, read from a log. Nothing here depends
 * on another feature module — only on the job queue and storage, which are
 * infrastructure — and nothing depends on this one yet.
 */
@Module({
  imports: [JobsModule, StorageModule],
  controllers: [SpotsController],
  providers: [
    SpotsService,
    SpotCoverJob,
    { provide: SpotsRepository, useClass: PrismaSpotsRepository },
    { provide: YouTubeThumbnails, useClass: HttpYouTubeThumbnails },
  ],
})
export class SpotsModule {}

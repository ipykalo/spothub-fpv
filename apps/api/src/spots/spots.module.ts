import { Module } from '@nestjs/common';

import { SpotsRepository } from './abstract/spots.repository';
import { PrismaSpotsRepository } from './prisma-spots.repository';
import { SpotsController } from './spots.controller';
import { SpotsService } from './spots.service';

/**
 * Places to fly: coordinates, the ground, the rules of the place.
 *
 * Kept apart from `flights` on purpose. A spot is somewhere, written by hand;
 * a flight is something that happened, read from a log. Nothing here depends
 * on another feature module, and nothing depends on this one yet.
 */
@Module({
  controllers: [SpotsController],
  providers: [SpotsService, { provide: SpotsRepository, useClass: PrismaSpotsRepository }],
})
export class SpotsModule {}

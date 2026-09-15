import { Module } from '@nestjs/common';

import { SpotsModule } from '../spots';
import { SpotCommentsRepository } from './abstract/spot-comments.repository';
import { PrismaSpotCommentsRepository } from './prisma-spot-comments.repository';
import { SpotCommentsController } from './spot-comments.controller';
import { SpotCommentsService } from './spot-comments.service';

/**
 * Questions and replies on spots, and the unread count their owners see.
 *
 * Its own bounded context rather than more of `spots`: a conversation has
 * authors other than the spot's owner, and rules of its own. It reaches spots
 * only through `SpotsFacade` — `spot-comments → spots`, never the other way.
 */
@Module({
  imports: [SpotsModule],
  controllers: [SpotCommentsController],
  providers: [
    SpotCommentsService,
    { provide: SpotCommentsRepository, useClass: PrismaSpotCommentsRepository },
  ],
})
export class SpotCommentsModule {}

import { Module } from '@nestjs/common';

import { LikesFacade } from './abstract/likes.facade';
import { LikesRepository } from './abstract/likes.repository';
import { LikesController } from './likes.controller';
import { LikesFacadeImpl } from './likes.facade.impl';
import { LikesService } from './likes.service';
import { PrismaLikesRepository } from './prisma-likes.repository';

/**
 * Likes: one heart per pilot per post or build.
 *
 * Depends on no feature module — whether a post or build may be seen is a join
 * in its own repository — so `posts` and `builds` can depend on `LikesFacade`
 * for their counts without closing a cycle. `LikesFacade` is the only
 * provider exported.
 */
@Module({
  controllers: [LikesController],
  providers: [
    LikesService,
    { provide: LikesRepository, useClass: PrismaLikesRepository },
    { provide: LikesFacade, useClass: LikesFacadeImpl },
  ],
  exports: [LikesFacade],
})
export class LikesModule {}

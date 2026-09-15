import { Module } from '@nestjs/common';

import { BuildsModule } from '../builds';
import { SpotsModule } from '../spots';
import { CommentsRepository } from './abstract/comments.repository';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { PrismaCommentsRepository } from './prisma-comments.repository';

/**
 * Questions and replies on spots and builds, and the unread counts their
 * owners see.
 *
 * Its own bounded context rather than more of `spots` or `builds`: a
 * conversation has authors other than the owner, and rules of its own, the
 * same whichever it hangs off. It reaches them only through `SpotsFacade` and
 * `BuildsFacade` — `comments → spots`, `comments → builds`, never the other way.
 */
@Module({
  imports: [SpotsModule, BuildsModule],
  controllers: [CommentsController],
  providers: [
    CommentsService,
    { provide: CommentsRepository, useClass: PrismaCommentsRepository },
  ],
})
export class CommentsModule {}

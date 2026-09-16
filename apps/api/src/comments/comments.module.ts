import { Module } from '@nestjs/common';

import { BuildsModule } from '../builds';
import { PostsModule } from '../posts';
import { SpotsModule } from '../spots';
import { CommentsRepository } from './abstract/comments.repository';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { PrismaCommentsRepository } from './prisma-comments.repository';

/**
 * Questions and replies on spots and builds, comments on posts, and the unread
 * counts their owners see.
 *
 * Its own bounded context rather than more of `spots`, `builds` or `posts`: a
 * conversation has authors other than the owner, and rules of its own, the
 * same whichever it hangs off. It reaches them only through `SpotsFacade`,
 * `BuildsFacade` and `PostsFacade` — `comments → spots`, `comments → builds`,
 * `comments → posts`, never the other way.
 */
@Module({
  imports: [SpotsModule, BuildsModule, PostsModule],
  controllers: [CommentsController],
  providers: [
    CommentsService,
    { provide: CommentsRepository, useClass: PrismaCommentsRepository },
  ],
})
export class CommentsModule {}

import { Module } from '@nestjs/common';

import { BlocksModule } from '../blocks';
import { BuildsModule } from '../builds';
import { PostsModule } from '../posts';
import { SpotsModule } from '../spots';
import { CommentsFacade } from './abstract/comments.facade';
import { CommentsRepository } from './abstract/comments.repository';
import { CommentsAdminController } from './controllers/comments-admin.controller';
import { CommentsController } from './controllers/comments.controller';
import { CommentsFacadeImpl } from './comments.facade.impl';
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
 * `comments → posts`, never the other way — and asks `BlocksFacade` whom a
 * reader blocked and whether an owner blocked a would-be commenter.
 * `CommentsFacade`, for `reports`, is the only provider exported.
 */
@Module({
  imports: [SpotsModule, BuildsModule, PostsModule, BlocksModule],
  controllers: [CommentsController, CommentsAdminController],
  providers: [
    CommentsService,
    { provide: CommentsRepository, useClass: PrismaCommentsRepository },
    { provide: CommentsFacade, useClass: CommentsFacadeImpl },
  ],
  exports: [CommentsFacade],
})
export class CommentsModule {}

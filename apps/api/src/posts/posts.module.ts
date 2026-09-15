import { Module } from '@nestjs/common';

import { BuildsModule } from '../builds';
import { MediaModule } from '../media';
import { PostsRepository } from './abstract/posts.repository';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { PrismaPostsRepository } from './prisma-posts.repository';

/**
 * The blog: posts pilots write, optionally about their own builds.
 *
 * Its own bounded context rather than more of `builds`: a post has an author,
 * a lifecycle and an audience of its own, and may be about several builds or
 * none. It reaches builds only through `BuildsFacade` and its images only
 * through `MediaFacade` — `posts → builds`, `posts → media`, never the other way.
 */
@Module({
  imports: [BuildsModule, MediaModule],
  controllers: [PostsController],
  providers: [
    PostsService,
    { provide: PostsRepository, useClass: PrismaPostsRepository },
  ],
})
export class PostsModule {}

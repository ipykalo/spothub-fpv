import { Controller, Delete, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import type { LikesDto } from '@spothub/shared';

import { type AuthenticatedUser, CurrentUser, CurrentViewer, Public } from '../common';
import { type LikeRef, LikeSubject } from './like.entity';
import { LikesService } from './likes.service';

const post = (subjectId: string): LikeRef => ({ subject: LikeSubject.Post, subjectId });
const build = (subjectId: string): LikeRef => ({ subject: LikeSubject.Build, subjectId });

/**
 * Likes on posts and builds, under the thing liked. Reading a count is
 * `@Public()`; liking and taking a like back need a signed-in pilot, taken
 * from the token. PUT and DELETE are idempotent and answer with the new count.
 *
 * The two sets are spelled out rather than generated: each is a one-line
 * hand-off, and a route table that reads top to bottom is worth the repetition.
 */
@Controller()
export class LikesController {
  constructor(private readonly likes: LikesService) {}

  @Public()
  @Get('posts/:postId/likes')
  getOnPost(
    @CurrentViewer() viewer: AuthenticatedUser | null,
    @Param('postId', ParseUUIDPipe) postId: string,
  ): Promise<LikesDto> {
    return this.likes.get(viewer?.id ?? null, post(postId));
  }

  @Put('posts/:postId/likes')
  likePost(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId', ParseUUIDPipe) postId: string,
  ): Promise<LikesDto> {
    return this.likes.like(user.id, post(postId));
  }

  @Delete('posts/:postId/likes')
  unlikePost(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId', ParseUUIDPipe) postId: string,
  ): Promise<LikesDto> {
    return this.likes.unlike(user.id, post(postId));
  }

  @Public()
  @Get('builds/:buildId/likes')
  getOnBuild(
    @CurrentViewer() viewer: AuthenticatedUser | null,
    @Param('buildId', ParseUUIDPipe) buildId: string,
  ): Promise<LikesDto> {
    return this.likes.get(viewer?.id ?? null, build(buildId));
  }

  @Put('builds/:buildId/likes')
  likeBuild(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildId', ParseUUIDPipe) buildId: string,
  ): Promise<LikesDto> {
    return this.likes.like(user.id, build(buildId));
  }

  @Delete('builds/:buildId/likes')
  unlikeBuild(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildId', ParseUUIDPipe) buildId: string,
  ): Promise<LikesDto> {
    return this.likes.unlike(user.id, build(buildId));
  }
}

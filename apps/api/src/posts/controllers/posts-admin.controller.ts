import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import {
  type HiddenCountDto,
  type HiddenPostDto,
  type SetHiddenDto,
  setHiddenSchema,
} from '@spothub/shared';

import { type AuthenticatedUser, CurrentUser, ZodValidationPipe } from '../../common';
import { PostsService } from '../posts.service';

/**
 * An admin's moderation of posts: hide, show again, delete — one post, or
 * every post a pilot wrote. Admins only, checked by role in the service.
 */
@Controller('admin')
export class PostsAdminController {
  constructor(private readonly posts: PostsService) {}

  @Get('posts/hidden')
  listHidden(@CurrentUser() viewer: AuthenticatedUser): Promise<HiddenPostDto[]> {
    return this.posts.listHidden(viewer);
  }

  @Patch('posts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  setHidden(
    @CurrentUser() viewer: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setHiddenSchema)) body: SetHiddenDto,
  ): Promise<void> {
    return this.posts.setHidden(viewer, id, body);
  }

  @Delete('posts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() viewer: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.posts.removeAny(viewer, id);
  }

  @Patch('users/:userId/posts')
  setHiddenForAuthor(
    @CurrentUser() viewer: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(setHiddenSchema)) body: SetHiddenDto,
  ): Promise<HiddenCountDto> {
    return this.posts.setHiddenForAuthor(viewer, userId, body);
  }
}

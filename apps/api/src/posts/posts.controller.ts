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
  Post,
  Query,
} from '@nestjs/common';
import {
  type CreatePostDto,
  type ListPublishedPostsQuery,
  type PostDto,
  type PostSummaryDto,
  type UpdatePostDto,
  createPostSchema,
  listPublishedPostsQuerySchema,
  updatePostSchema,
} from '@spothub/shared';

import {
  type AuthenticatedUser,
  CurrentUser,
  CurrentViewer,
  Public,
  ZodValidationPipe,
} from '../common';
import { PostsService } from './posts.service';

/**
 * Blog posts. Guarded by the global JwtAuthGuard, except the two reads the
 * public blog needs — the published list and one post — which answer a
 * signed-out visitor with only what is shared. Writing always needs a
 * signed-in author, taken from the token, never the payload.
 */
@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  /** The viewer's own posts, drafts included. */
  @Get()
  listMine(@CurrentUser() user: AuthenticatedUser): Promise<PostSummaryDto[]> {
    return this.posts.listMine(user.id);
  }

  /**
   * The blog: Public posts, newest first, for anyone. `?buildId=` narrows it to
   * posts about one build. Declared before `:id`, which would otherwise take
   * "published" as an id and refuse it as not a UUID.
   */
  @Public()
  @Get('published')
  listPublished(
    @CurrentViewer() viewer: AuthenticatedUser | null,
    @Query(new ZodValidationPipe(listPublishedPostsQuerySchema))
    query: ListPublishedPostsQuery,
  ): Promise<PostSummaryDto[]> {
    return this.posts.listPublished(viewer?.id ?? null, query);
  }

  /** One of yours, or one someone shared as Public or Unlisted — which a visitor may open too. */
  @Public()
  @Get(':id')
  getOne(
    @CurrentViewer() viewer: AuthenticatedUser | null,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PostDto> {
    return this.posts.getOne(viewer?.id ?? null, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createPostSchema)) body: CreatePostDto,
  ): Promise<PostDto> {
    return this.posts.create(user.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePostSchema)) body: UpdatePostDto,
  ): Promise<PostDto> {
    return this.posts.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.posts.remove(user.id, id);
  }
}

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
  Put,
} from '@nestjs/common';
import {
  CommentSubject,
  type ConversationDto,
  type CreateCommentDto,
  type MarkAnswerDto,
  type UnreadCommentsDto,
  type UpdateCommentDto,
  createCommentSchema,
  markAnswerSchema,
  updateCommentSchema,
} from '@spothub/shared';

import {
  type AuthenticatedUser,
  CurrentUser,
  CurrentViewer,
  Public,
  ZodValidationPipe,
} from '../common';
import type { SubjectRef } from './comment.entity';
import { CommentsService } from './comments.service';

const spot = (subjectId: string): SubjectRef => ({
  subject: CommentSubject.Spot,
  subjectId,
});
const build = (subjectId: string): SubjectRef => ({
  subject: CommentSubject.Build,
  subjectId,
});
const post = (subjectId: string): SubjectRef => ({
  subject: CommentSubject.Post,
  subjectId,
});

/**
 * Questions and replies on spots and builds, and comments on posts. Guarded by
 * the global JwtAuthGuard.
 *
 * The routes sit under `spots/:spotId`, `builds/:buildId` and `posts/:postId`, where each
 * conversation belongs, so the controller has no prefix of its own. The two
 * sets are spelled out rather than generated: each is a one-line hand-off,
 * and a route table that reads top to bottom is worth the repetition. Who may
 * read, write, edit, delete or mark an answer is decided by the service and
 * the repository's scoped queries — never by an id or a flag in the request
 * body.
 */
@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  /** How many comments by other people wait unread on each of the viewer's spots and builds. */
  @Get('comments/unread')
  unread(@CurrentUser() user: AuthenticatedUser): Promise<UnreadCommentsDto> {
    return this.comments.unread(user.id);
  }

  // --- On a spot ---

  @Get('spots/:spotId/comments')
  listOnSpot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spotId', ParseUUIDPipe) spotId: string,
  ): Promise<ConversationDto> {
    return this.comments.list(user.id, spot(spotId));
  }

  /** A question, or a reply when the body names one. Answers with the whole conversation. */
  @Post('spots/:spotId/comments')
  createOnSpot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spotId', ParseUUIDPipe) spotId: string,
    @Body(new ZodValidationPipe(createCommentSchema)) body: CreateCommentDto,
  ): Promise<ConversationDto> {
    return this.comments.create(user.id, spot(spotId), body);
  }

  /** The spot's owner has now read everything on it. A no-op for anyone else. */
  @Post('spots/:spotId/comments/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markSpotRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spotId', ParseUUIDPipe) spotId: string,
  ): Promise<void> {
    return this.comments.markRead(user.id, spot(spotId));
  }

  @Patch('spots/:spotId/comments/:commentId')
  updateOnSpot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spotId', ParseUUIDPipe) spotId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body(new ZodValidationPipe(updateCommentSchema)) body: UpdateCommentDto,
  ): Promise<ConversationDto> {
    return this.comments.update(user.id, spot(spotId), commentId, body);
  }

  /** Answers with what is left of the conversation. */
  @Delete('spots/:spotId/comments/:commentId')
  removeOnSpot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spotId', ParseUUIDPipe) spotId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ): Promise<ConversationDto> {
    return this.comments.remove(user.id, spot(spotId), commentId);
  }

  @Put('spots/:spotId/comments/:commentId/answer')
  setAnswerOnSpot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spotId', ParseUUIDPipe) spotId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body(new ZodValidationPipe(markAnswerSchema)) body: MarkAnswerDto,
  ): Promise<ConversationDto> {
    return this.comments.setAnswer(user.id, spot(spotId), commentId, body);
  }

  // --- On a build ---

  /**
   * Readable by a signed-out visitor too, on a build shared as Public or
   * Unlisted: a public build page shows its questions and answers, and asking
   * still needs signing in.
   */
  @Public()
  @Get('builds/:buildId/comments')
  listOnBuild(
    @CurrentViewer() viewer: AuthenticatedUser | null,
    @Param('buildId', ParseUUIDPipe) buildId: string,
  ): Promise<ConversationDto> {
    return this.comments.list(viewer?.id ?? null, build(buildId));
  }

  @Post('builds/:buildId/comments')
  createOnBuild(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildId', ParseUUIDPipe) buildId: string,
    @Body(new ZodValidationPipe(createCommentSchema)) body: CreateCommentDto,
  ): Promise<ConversationDto> {
    return this.comments.create(user.id, build(buildId), body);
  }

  @Post('builds/:buildId/comments/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markBuildRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildId', ParseUUIDPipe) buildId: string,
  ): Promise<void> {
    return this.comments.markRead(user.id, build(buildId));
  }

  @Patch('builds/:buildId/comments/:commentId')
  updateOnBuild(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildId', ParseUUIDPipe) buildId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body(new ZodValidationPipe(updateCommentSchema)) body: UpdateCommentDto,
  ): Promise<ConversationDto> {
    return this.comments.update(user.id, build(buildId), commentId, body);
  }

  @Delete('builds/:buildId/comments/:commentId')
  removeOnBuild(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildId', ParseUUIDPipe) buildId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ): Promise<ConversationDto> {
    return this.comments.remove(user.id, build(buildId), commentId);
  }

  @Put('builds/:buildId/comments/:commentId/answer')
  setAnswerOnBuild(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildId', ParseUUIDPipe) buildId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body(new ZodValidationPipe(markAnswerSchema)) body: MarkAnswerDto,
  ): Promise<ConversationDto> {
    return this.comments.setAnswer(user.id, build(buildId), commentId, body);
  }

  // --- On a post: the same, without an answer to mark ---

  /** Readable by a signed-out visitor too, on a post shared as Public or Unlisted. */
  @Public()
  @Get('posts/:postId/comments')
  listOnPost(
    @CurrentViewer() viewer: AuthenticatedUser | null,
    @Param('postId', ParseUUIDPipe) postId: string,
  ): Promise<ConversationDto> {
    return this.comments.list(viewer?.id ?? null, post(postId));
  }

  @Post('posts/:postId/comments')
  createOnPost(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Body(new ZodValidationPipe(createCommentSchema)) body: CreateCommentDto,
  ): Promise<ConversationDto> {
    return this.comments.create(user.id, post(postId), body);
  }

  @Post('posts/:postId/comments/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markPostRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId', ParseUUIDPipe) postId: string,
  ): Promise<void> {
    return this.comments.markRead(user.id, post(postId));
  }

  @Patch('posts/:postId/comments/:commentId')
  updateOnPost(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body(new ZodValidationPipe(updateCommentSchema)) body: UpdateCommentDto,
  ): Promise<ConversationDto> {
    return this.comments.update(user.id, post(postId), commentId, body);
  }

  @Delete('posts/:postId/comments/:commentId')
  removeOnPost(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ): Promise<ConversationDto> {
    return this.comments.remove(user.id, post(postId), commentId);
  }
}

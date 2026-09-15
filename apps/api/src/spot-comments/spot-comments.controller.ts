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
  type CreateSpotCommentDto,
  type MarkAnswerDto,
  type SpotCommentsDto,
  type UnreadSpotCommentsDto,
  type UpdateSpotCommentDto,
  createSpotCommentSchema,
  markAnswerSchema,
  updateSpotCommentSchema,
} from '@spothub/shared';

import { type AuthenticatedUser, CurrentUser, ZodValidationPipe } from '../common';
import { SpotCommentsService } from './spot-comments.service';

/**
 * Questions and replies on spots. Guarded by the global JwtAuthGuard.
 *
 * The routes sit under `spots/:spotId`, where the conversation belongs, so the
 * controller has no prefix of its own. Who may read, write, edit, delete or
 * mark an answer is decided by the service and the repository's scoped
 * queries — never by an id or a flag in the request body.
 */
@Controller()
export class SpotCommentsController {
  constructor(private readonly comments: SpotCommentsService) {}

  /** How many comments by other people wait unread on each of the viewer's spots. */
  @Get('spot-comments/unread')
  unread(@CurrentUser() user: AuthenticatedUser): Promise<UnreadSpotCommentsDto> {
    return this.comments.unread(user.id);
  }

  @Get('spots/:spotId/comments')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spotId', ParseUUIDPipe) spotId: string,
  ): Promise<SpotCommentsDto> {
    return this.comments.list(user.id, spotId);
  }

  /** A question, or a reply when the body names one. Answers with the whole conversation. */
  @Post('spots/:spotId/comments')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spotId', ParseUUIDPipe) spotId: string,
    @Body(new ZodValidationPipe(createSpotCommentSchema)) body: CreateSpotCommentDto,
  ): Promise<SpotCommentsDto> {
    return this.comments.create(user.id, spotId, body);
  }

  /** The spot's owner has now read everything on it. A no-op for anyone else. */
  @Post('spots/:spotId/comments/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spotId', ParseUUIDPipe) spotId: string,
  ): Promise<void> {
    return this.comments.markRead(user.id, spotId);
  }

  @Patch('spots/:spotId/comments/:commentId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spotId', ParseUUIDPipe) spotId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body(new ZodValidationPipe(updateSpotCommentSchema)) body: UpdateSpotCommentDto,
  ): Promise<SpotCommentsDto> {
    return this.comments.update(user.id, spotId, commentId, body);
  }

  /** Answers with what is left of the conversation. */
  @Delete('spots/:spotId/comments/:commentId')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spotId', ParseUUIDPipe) spotId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ): Promise<SpotCommentsDto> {
    return this.comments.remove(user.id, spotId, commentId);
  }

  @Put('spots/:spotId/comments/:commentId/answer')
  setAnswer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spotId', ParseUUIDPipe) spotId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body(new ZodValidationPipe(markAnswerSchema)) body: MarkAnswerDto,
  ): Promise<SpotCommentsDto> {
    return this.comments.setAnswer(user.id, spotId, commentId, body);
  }
}

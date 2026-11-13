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
  type HiddenCommentDto,
  type SetHiddenDto,
  setHiddenSchema,
} from '@spothub/shared';

import { type AuthenticatedUser, CurrentUser, ZodValidationPipe } from '../../common';
import { CommentsService } from '../comments.service';

/**
 * An admin's moderation of comments on spots, builds and posts: hide, show
 * again, delete. Admins only, checked by role in the service.
 */
@Controller('admin/comments')
export class CommentsAdminController {
  constructor(private readonly comments: CommentsService) {}

  @Get('hidden')
  listHidden(@CurrentUser() viewer: AuthenticatedUser): Promise<HiddenCommentDto[]> {
    return this.comments.listHidden(viewer);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  setHidden(
    @CurrentUser() viewer: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setHiddenSchema)) body: SetHiddenDto,
  ): Promise<void> {
    return this.comments.setHidden(viewer, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() viewer: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.comments.removeAny(viewer, id);
  }
}

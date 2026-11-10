import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  type BuildVideoDto,
  type CreateBuildVideoDto,
  createBuildVideoSchema,
} from '@spothub/shared';

import { type AuthenticatedUser, CurrentUser, ZodValidationPipe } from '../common';
import { BuildVideosService } from './build-videos.service';

/**
 * Nested under a build, like its repairs. Guarded like every build read:
 * whoever may open the build sees its videos; only its owner adds or removes.
 */
@Controller('builds/:buildId/videos')
export class BuildVideosController {
  constructor(private readonly videos: BuildVideosService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildId', ParseUUIDPipe) buildId: string,
  ): Promise<BuildVideoDto[]> {
    return this.videos.list(user.id, buildId);
  }

  @Post()
  add(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildId', ParseUUIDPipe) buildId: string,
    @Body(new ZodValidationPipe(createBuildVideoSchema)) body: CreateBuildVideoDto,
  ): Promise<BuildVideoDto> {
    return this.videos.add(user.id, buildId, body);
  }

  @Delete(':videoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildId', ParseUUIDPipe) buildId: string,
    @Param('videoId', ParseUUIDPipe) videoId: string,
  ): Promise<void> {
    return this.videos.remove(user.id, buildId, videoId);
  }
}

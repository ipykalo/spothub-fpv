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
} from '@nestjs/common';
import {
  type AssetDto,
  type ReorderPhotosDto,
  type RequestUploadDto,
  type SetCoverDto,
  type UploadTicketDto,
  reorderPhotosSchema,
  requestUploadSchema,
  setCoverSchema,
} from '@spothub/shared';

import { type AuthenticatedUser, CurrentUser, ZodValidationPipe } from '../common';
import { AssetsService } from './assets.service';

/**
 * Photos, addressed through the build they belong to — the same shape as
 * repairs and configs. Guarded by the global JwtAuthGuard.
 *
 * Uploading is two calls on purpose. `POST /uploads` hands back a presigned
 * PUT and the client sends the bytes straight to storage; `POST
 * /:assetId/commit` is where the API first reads them, strips EXIF and makes
 * the thumbnail. No route here ever accepts a file body.
 */
@Controller('builds/:buildId/photos')
export class BuildPhotosController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildId', ParseUUIDPipe) buildId: string,
  ): Promise<AssetDto[]> {
    return this.assets.list(user.id, buildId);
  }

  @Post('uploads')
  @HttpCode(HttpStatus.OK)
  requestUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildId', ParseUUIDPipe) buildId: string,
    @Body(new ZodValidationPipe(requestUploadSchema)) body: RequestUploadDto,
  ): Promise<UploadTicketDto> {
    return this.assets.requestUpload(user.id, buildId, body);
  }

  @Post(':assetId/commit')
  @HttpCode(HttpStatus.OK)
  commit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildId', ParseUUIDPipe) buildId: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ): Promise<AssetDto> {
    return this.assets.commit(user.id, buildId, assetId);
  }

  /** The whole order, so the result cannot be ambiguous. */
  @Patch('order')
  reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildId', ParseUUIDPipe) buildId: string,
    @Body(new ZodValidationPipe(reorderPhotosSchema)) body: ReorderPhotosDto,
  ): Promise<AssetDto[]> {
    return this.assets.reorder(user.id, buildId, body.assetIds);
  }

  @Patch('cover')
  @HttpCode(HttpStatus.NO_CONTENT)
  setCover(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildId', ParseUUIDPipe) buildId: string,
    @Body(new ZodValidationPipe(setCoverSchema)) body: SetCoverDto,
  ): Promise<void> {
    return this.assets.setCover(user.id, buildId, body.assetId);
  }

  @Delete(':assetId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildId', ParseUUIDPipe) buildId: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ): Promise<void> {
    return this.assets.remove(user.id, buildId, assetId);
  }
}

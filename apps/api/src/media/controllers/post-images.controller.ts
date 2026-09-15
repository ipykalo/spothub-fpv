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
  type RequestUploadDto,
  type SetCoverDto,
  type UploadTicketDto,
  requestUploadSchema,
  setCoverSchema,
} from '@spothub/shared';

import {
  type AuthenticatedUser,
  CurrentUser,
  CurrentViewer,
  Public,
  ZodValidationPipe,
} from '../../common';
import { AssetSubject } from '../asset.entity';
import { AssetsService } from '../assets.service';

/**
 * A post's images: the cover and the pictures in its body, through the same
 * presigned pipeline as build photos — the bytes go straight to storage, and
 * commit strips EXIF and makes the thumbnail.
 *
 * Only the author uploads, deletes or picks the cover. The list is
 * `@Public()`, for anyone the post is shared with.
 */
@Controller('posts/:postId/images')
export class PostImagesController {
  constructor(private readonly assets: AssetsService) {}

  @Public()
  @Get()
  list(
    @CurrentViewer() viewer: AuthenticatedUser | null,
    @Param('postId', ParseUUIDPipe) postId: string,
  ): Promise<AssetDto[]> {
    return this.assets.list(viewer?.id ?? null, AssetSubject.Post, postId);
  }

  @Post('uploads')
  @HttpCode(HttpStatus.OK)
  requestUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Body(new ZodValidationPipe(requestUploadSchema)) body: RequestUploadDto,
  ): Promise<UploadTicketDto> {
    return this.assets.requestUpload(user.id, AssetSubject.Post, postId, body);
  }

  @Post(':assetId/commit')
  @HttpCode(HttpStatus.OK)
  commit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ): Promise<AssetDto> {
    return this.assets.commit(user.id, AssetSubject.Post, postId, assetId);
  }

  /** One of the post's own images, or null for no cover. */
  @Patch('cover')
  @HttpCode(HttpStatus.NO_CONTENT)
  setCover(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Body(new ZodValidationPipe(setCoverSchema)) body: SetCoverDto,
  ): Promise<void> {
    return this.assets.setPostCover(user.id, postId, body.assetId);
  }

  @Delete(':assetId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ): Promise<void> {
    return this.assets.remove(user.id, AssetSubject.Post, postId, assetId);
  }
}

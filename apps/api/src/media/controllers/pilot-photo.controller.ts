import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Redirect,
} from '@nestjs/common';
import {
  type PilotPhotoDto,
  type RequestUploadDto,
  type UploadTicketDto,
  requestUploadSchema,
} from '@spothub/shared';

import {
  type AuthenticatedUser,
  CurrentUser,
  Public,
  RateLimit,
  ZodValidationPipe,
} from '../../common';
import { PilotPhotoService } from '../pilot-photo.service';

/**
 * A pilot's profile photo: theirs to upload and remove, and anyone's to see
 * at a lasting address beside their name.
 */
@Controller('users')
export class PilotPhotoController {
  constructor(private readonly photos: PilotPhotoService) {}

  @RateLimit('imageUpload')
  @Post('me/photo/uploads')
  @HttpCode(HttpStatus.OK)
  requestUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(requestUploadSchema)) body: RequestUploadDto,
  ): Promise<UploadTicketDto> {
    return this.photos.requestUpload(user.id, body);
  }

  @Post('me/photo/uploads/:assetId/commit')
  @HttpCode(HttpStatus.OK)
  commit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ): Promise<PilotPhotoDto> {
    return this.photos.commit(user.id, assetId);
  }

  @Delete('me/photo')
  remove(@CurrentUser() user: AuthenticatedUser): Promise<PilotPhotoDto> {
    return this.photos.remove(user.id);
  }

  /**
   * The photo itself, at an address that does not expire: a redirect to a
   * freshly signed one, cacheable for a few minutes — the same as a post's
   * images. The address carries the photo's id, so a new photo is a new
   * address and never comes out of a cache stale.
   */
  @Public()
  @Get(':userId/photo')
  @Header('Cache-Control', 'public, max-age=300')
  @Redirect()
  async file(@Param('userId', ParseUUIDPipe) userId: string): Promise<{ url: string }> {
    return { url: await this.photos.storageUrl(userId) };
  }
}

import { Module } from '@nestjs/common';

import { JobsModule } from '../jobs';
import { StorageModule } from '../storage';
import { UsersModule } from '../users';
import { AssetsRepository } from './abstract/assets.repository';
import { MediaFacade } from './abstract/media.facade';
import { AssetsService } from './assets.service';
import { BuildPhotosController } from './controllers/build-photos.controller';
import { PilotPhotoController } from './controllers/pilot-photo.controller';
import { DisplayBackfillJob } from './display-backfill.job';
import { PostImagesController } from './controllers/post-images.controller';
import { MediaFacadeImpl } from './media.facade.impl';
import { PilotPhotoService } from './pilot-photo.service';
import { PrismaAssetsRepository } from './prisma-assets.repository';

/**
 * Images: presigned upload straight to object storage, EXIF stripped and a
 * thumbnail and a display version generated when the client commits — for a build's photos and a
 * post's images alike — and a pilot's profile photo, cropped to one small square.
 *
 * Depends on one feature module only, `users`, which it asks through
 * `UsersFacade` whether an upload still fits under the pilot's storage
 * limit. An image is reached through its subject, but that ownership check
 * is a join inside this module's own repository — so `builds` and `posts`
 * can depend on `MediaFacade` without closing a cycle. `MediaFacade` is the only provider exported.
 */
@Module({
  imports: [JobsModule, StorageModule, UsersModule],
  controllers: [BuildPhotosController, PostImagesController, PilotPhotoController],
  providers: [
    AssetsService,
    PilotPhotoService,
    DisplayBackfillJob,
    { provide: AssetsRepository, useClass: PrismaAssetsRepository },
    { provide: MediaFacade, useClass: MediaFacadeImpl },
  ],
  exports: [MediaFacade],
})
export class MediaModule {}

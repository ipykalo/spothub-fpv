import { Module } from '@nestjs/common';

import { StorageModule } from '../storage';
import { AssetsRepository } from './abstract/assets.repository';
import { MediaFacade } from './abstract/media.facade';
import { AssetsService } from './assets.service';
import { BuildPhotosController } from './controllers/build-photos.controller';
import { PostImagesController } from './controllers/post-images.controller';
import { MediaFacadeImpl } from './media.facade.impl';
import { PrismaAssetsRepository } from './prisma-assets.repository';

/**
 * Images: presigned upload straight to object storage, EXIF stripped and a
 * thumbnail generated when the client commits — for a build's photos and a
 * post's images alike.
 *
 * Depends on no other feature module. An image is reached through its
 * subject, but that ownership check is a join inside this module's own
 * repository — so `builds` and `posts` can depend on `MediaFacade` without
 * closing a cycle. `MediaFacade` is the only provider exported.
 */
@Module({
  imports: [StorageModule],
  controllers: [BuildPhotosController, PostImagesController],
  providers: [
    AssetsService,
    { provide: AssetsRepository, useClass: PrismaAssetsRepository },
    { provide: MediaFacade, useClass: MediaFacadeImpl },
  ],
  exports: [MediaFacade],
})
export class MediaModule {}

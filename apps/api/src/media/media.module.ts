import { Module } from '@nestjs/common';

import { StorageModule } from '../storage';
import { AssetsRepository } from './abstract/assets.repository';
import { MediaFacade } from './abstract/media.facade';
import { AssetsService } from './assets.service';
import { BuildPhotosController } from './build-photos.controller';
import { MediaFacadeImpl } from './media.facade.impl';
import { PrismaAssetsRepository } from './prisma-assets.repository';

/**
 * Photos: presigned upload straight to object storage, EXIF stripped and a
 * thumbnail generated when the client commits.
 *
 * Depends on no other feature module. A photo is reached through its subject,
 * but that ownership check is a join inside this module's own repository — so
 * `builds` can depend on `MediaFacade` for a cover image without closing a
 * cycle. `MediaFacade` is the only provider exported.
 */
@Module({
  imports: [StorageModule],
  controllers: [BuildPhotosController],
  providers: [
    AssetsService,
    { provide: AssetsRepository, useClass: PrismaAssetsRepository },
    { provide: MediaFacade, useClass: MediaFacadeImpl },
  ],
  exports: [MediaFacade],
})
export class MediaModule {}

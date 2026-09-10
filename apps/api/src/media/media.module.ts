import { Module } from '@nestjs/common';

import { AssetsRepository } from './abstract/assets.repository';
import { MediaFacade } from './abstract/media.facade';
import { StorageGateway } from './abstract/storage.gateway';
import { AssetsService } from './assets.service';
import { BuildPhotosController } from './build-photos.controller';
import { MediaFacadeImpl } from './media.facade.impl';
import { PrismaAssetsRepository } from './prisma-assets.repository';
import { S3StorageGateway } from './s3-storage.gateway';

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
  controllers: [BuildPhotosController],
  providers: [
    AssetsService,
    { provide: AssetsRepository, useClass: PrismaAssetsRepository },
    { provide: StorageGateway, useClass: S3StorageGateway },
    { provide: MediaFacade, useClass: MediaFacadeImpl },
  ],
  exports: [MediaFacade],
})
export class MediaModule {}

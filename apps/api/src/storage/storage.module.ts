import { Module } from '@nestjs/common';

import { StorageGateway } from './abstract/storage.gateway';
import { S3StorageGateway } from './s3-storage.gateway';

/**
 * Object storage, as infrastructure — the same standing as `prisma/`.
 *
 * It began inside `media`, when photos were the only thing stored. Flight logs
 * need the same presigned rails, and a gateway private to one feature module
 * could only have been reached through that module's facade — which would
 * have made `media` a storage service for everyone. The port and its S3
 * adapter belong to no feature, so they live here and any module imports them.
 */
@Module({
  providers: [{ provide: StorageGateway, useClass: S3StorageGateway }],
  exports: [StorageGateway],
})
export class StorageModule {}

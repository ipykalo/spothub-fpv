import { Module } from '@nestjs/common';

import { PartsController } from './parts.controller';
import { PartsRepository } from './parts.repository';
import { PartsService } from './parts.service';
import { PrismaPartsRepository } from './prisma-parts.repository';
import { UrlPreviewService } from './url-preview.service';

@Module({
  controllers: [PartsController],
  providers: [
    PartsService,
    UrlPreviewService,
    { provide: PartsRepository, useClass: PrismaPartsRepository },
  ],
})
export class PartsModule {}

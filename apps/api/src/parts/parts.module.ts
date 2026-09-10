import { Module } from '@nestjs/common';

import { PartSourcesRepository } from './abstract/part-sources.repository';
import { PartUnitsRepository } from './abstract/part-units.repository';
import { PartsFacade } from './abstract/parts.facade';
import { PartsRepository } from './abstract/parts.repository';
import { PartSourcesController } from './controllers/part-sources.controller';
import { PartUnitsController } from './controllers/part-units.controller';
import { PartsController } from './controllers/parts.controller';
import { UrlPreviewController } from './controllers/url-preview.controller';
import { PartsFacadeImpl } from './parts.facade.impl';
import { PrismaPartSourcesRepository } from './repositories/prisma-part-sources.repository';
import { PrismaPartUnitsRepository } from './repositories/prisma-part-units.repository';
import { PrismaPartsRepository } from './repositories/prisma-parts.repository';
import { PartSourcesService } from './services/part-sources.service';
import { PartUnitsService } from './services/part-units.service';
import { PartsService } from './services/parts.service';
import { UrlPreviewService } from './services/url-preview.service';

/**
 * The parts inventory: a catalogue of kinds, the physical units behind them,
 * and where each was priced.
 *
 * One module rather than three, because units and sources are children of the
 * part aggregate — `PartDto` embeds both, so splitting them would leave this
 * module calling out for its own data.
 *
 * `PartsFacade` is the only provider exported. Nothing outside may reach a
 * repository here.
 */
@Module({
  controllers: [
    // Listed first so its fixed `url-preview` path is matched before any
    // parameterised sibling route can claim it.
    UrlPreviewController,
    PartsController,
    PartUnitsController,
    PartSourcesController,
  ],
  providers: [
    PartsService,
    PartUnitsService,
    PartSourcesService,
    UrlPreviewService,
    { provide: PartsRepository, useClass: PrismaPartsRepository },
    { provide: PartUnitsRepository, useClass: PrismaPartUnitsRepository },
    { provide: PartSourcesRepository, useClass: PrismaPartSourcesRepository },
    { provide: PartsFacade, useClass: PartsFacadeImpl },
  ],
  exports: [PartsFacade],
})
export class PartsModule {}

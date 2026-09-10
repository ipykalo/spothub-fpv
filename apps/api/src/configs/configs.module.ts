import { Module } from '@nestjs/common';

import { ConfigsRepository } from './abstract/configs.repository';
import { ConfigsController } from './configs.controller';
import { PrismaConfigsRepository } from './prisma-configs.repository';
import { ConfigsService } from './configs.service';

/**
 * Firmware config snapshots — Betaflight CLI captures taken against a build.
 *
 * Depends on no other feature module: a capture is reached through its build,
 * but that ownership check is a join inside this module's own repository, not
 * a call into the builds module.
 */
@Module({
  controllers: [ConfigsController],
  providers: [
    ConfigsService,
    { provide: ConfigsRepository, useClass: PrismaConfigsRepository },
  ],
})
export class ConfigsModule {}

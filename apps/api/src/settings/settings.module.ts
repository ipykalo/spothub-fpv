import { Module } from '@nestjs/common';

import { SettingsFacade } from './abstract/settings.facade';
import { SettingsRepository } from './abstract/settings.repository';
import { PrismaSettingsRepository } from './prisma-settings.repository';
import { SettingsController } from './settings.controller';
import { SettingsFacadeImpl } from './settings.facade.impl';
import { SettingsService } from './settings.service';

/**
 * The settings an admin changes from the Admin page: today, who may sign in.
 *
 * Depends on no feature module. `auth` asks `SettingsFacade` at every sign-in,
 * which is its only export.
 */
@Module({
  controllers: [SettingsController],
  providers: [
    SettingsService,
    { provide: SettingsRepository, useClass: PrismaSettingsRepository },
    { provide: SettingsFacade, useClass: SettingsFacadeImpl },
  ],
  exports: [SettingsFacade],
})
export class SettingsModule {}

import { Injectable } from '@nestjs/common';

import { SettingsFacade } from './abstract/settings.facade';
import { SettingsService } from './settings.service';
import { permitsSignIn } from './sign-up-policy';

/** Serves the settings facade from the module's own service. */
@Injectable()
export class SettingsFacadeImpl extends SettingsFacade {
  constructor(private readonly settings: SettingsService) {
    super();
  }

  async permitsSignIn(email: string): Promise<boolean> {
    return permitsSignIn(await this.settings.current(), email);
  }

  async blockedCountries(): Promise<readonly string[]> {
    return (await this.settings.current()).blockedCountries;
  }

  async defaultStorageQuotaBytes(): Promise<number> {
    return (await this.settings.current()).defaultStorageQuotaBytes;
  }
}

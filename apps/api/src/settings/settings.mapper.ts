import type { AppSettingsDto } from '@spothub/shared';

import type { AppSettingsEntity } from './app-settings.entity';

/** The single place the settings entity becomes a wire object. */
export function toAppSettingsDto(settings: AppSettingsEntity): AppSettingsDto {
  return {
    openRegistration: settings.openRegistration,
    allowedEmails: [...settings.allowedEmails],
    defaultStorageQuotaBytes: settings.defaultStorageQuotaBytes,
    blockedCountries: [...settings.blockedCountries],
    updatedAt: settings.updatedAt.toISOString(),
  };
}

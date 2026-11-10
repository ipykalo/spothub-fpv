import type { AppSettingsEntity, UpdateAppSettingsData } from '../app-settings.entity';

/**
 * Persistence contract for the one settings row.
 *
 * Not owner-scoped, unlike every other repository: the settings are the
 * app's, and who may change them is decided by role in the service.
 */
export abstract class SettingsRepository {
  /** The row, created from `initial` the first time anything asks. */
  abstract findOrCreate(initial: UpdateAppSettingsData): Promise<AppSettingsEntity>;

  /** Writes `data`, creating the row from `initial` first if it is not there yet. */
  abstract update(
    initial: UpdateAppSettingsData,
    data: UpdateAppSettingsData,
  ): Promise<AppSettingsEntity>;
}

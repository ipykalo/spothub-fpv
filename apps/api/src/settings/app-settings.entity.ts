/** The app's own settings, as the domain understands them — no ORM types. */
export interface AppSettingsEntity {
  readonly openRegistration: boolean;
  /** Lower-cased. */
  readonly allowedEmails: readonly string[];
  readonly defaultStorageQuotaBytes: number;
  /** ISO codes, upper-cased: nobody but an admin signs in from these. */
  readonly blockedCountries: readonly string[];
  readonly updatedAt: Date;
}

/** A sparse patch. Only the keys present are written. */
export type UpdateAppSettingsData = Partial<
  Pick<
    AppSettingsEntity,
    'openRegistration' | 'allowedEmails' | 'defaultStorageQuotaBytes' | 'blockedCountries'
  >
>;

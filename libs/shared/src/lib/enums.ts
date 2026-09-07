/**
 * Domain enums shared by the API and the client.
 *
 * Declared as const objects rather than TypeScript `enum`s: they erase to plain
 * values, tree-shake, and stay assignable from the string literals Prisma and
 * JSON payloads produce.
 */

export const BuildClass = {
  Whoop: 'WHOOP',
  ThreeInch: 'THREE_INCH',
  FiveInch: 'FIVE_INCH',
  SevenInch: 'SEVEN_INCH',
  Cinewhoop: 'CINEWHOOP',
  LongRange: 'LONG_RANGE',
  Wing: 'WING',
} as const;
export type BuildClass = (typeof BuildClass)[keyof typeof BuildClass];

export const BuildStatus = {
  Planning: 'PLANNING',
  Active: 'ACTIVE',
  /** Grounded, waiting on a part. */
  Down: 'DOWN',
  Retired: 'RETIRED',
} as const;
export type BuildStatus = (typeof BuildStatus)[keyof typeof BuildStatus];

export const Visibility = {
  Private: 'PRIVATE',
  Unlisted: 'UNLISTED',
  Public: 'PUBLIC',
} as const;
export type Visibility = (typeof Visibility)[keyof typeof Visibility];

export const Role = {
  User: 'USER',
  Admin: 'ADMIN',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

/** Human labels, so the client never hand-maps enum values in a template. */
export const BUILD_CLASS_LABELS: Readonly<Record<BuildClass, string>> = {
  [BuildClass.Whoop]: 'Tiny whoop',
  [BuildClass.ThreeInch]: '3 inch',
  [BuildClass.FiveInch]: '5 inch',
  [BuildClass.SevenInch]: '7 inch',
  [BuildClass.Cinewhoop]: 'Cinewhoop',
  [BuildClass.LongRange]: 'Long range',
  [BuildClass.Wing]: 'Wing',
};

export const BUILD_STATUS_LABELS: Readonly<Record<BuildStatus, string>> = {
  [BuildStatus.Planning]: 'Planning',
  [BuildStatus.Active]: 'Active',
  [BuildStatus.Down]: 'Down',
  [BuildStatus.Retired]: 'Retired',
};

export const VISIBILITY_LABELS: Readonly<Record<Visibility, string>> = {
  [Visibility.Private]: 'Private',
  [Visibility.Unlisted]: 'Unlisted',
  [Visibility.Public]: 'Public',
};

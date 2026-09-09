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

export const PartCategory = {
  Frame: 'FRAME',
  Motor: 'MOTOR',
  Esc: 'ESC',
  /** Flight controller. */
  Fc: 'FC',
  /** An FC and ESC sold as one unit. */
  Stack: 'STACK',
  Vtx: 'VTX',
  Camera: 'CAMERA',
  /** Radio receiver. */
  Rx: 'RX',
  Antenna: 'ANTENNA',
  Prop: 'PROP',
  Battery: 'BATTERY',
  Other: 'OTHER',
} as const;
export type PartCategory = (typeof PartCategory)[keyof typeof PartCategory];

/**
 * The condition of one physical unit — the half only the owner knows.
 *
 * Lives on a unit rather than on the part, because one value cannot describe
 * four motors: marking the row broken condemned all four. Says nothing about
 * where the unit is either — whether it is fitted is a fact `build_parts`
 * already holds, and a typed copy would drift from it.
 */
export const PartCondition = {
  /** Fit to use, whether or not it is currently on a quad. */
  Serviceable: 'SERVICEABLE',
  /** Damaged. Must not be fitted to anything. */
  Broken: 'BROKEN',
  /** Worn out or superseded, kept for the record. */
  Retired: 'RETIRED',
} as const;
export type PartCondition = (typeof PartCondition)[keyof typeof PartCondition];

export const InstallReason = {
  /** Fitted when the build was first put together. */
  Initial: 'INITIAL',
  /** Swapped in for something broken or worn. */
  Replacement: 'REPLACEMENT',
  Upgrade: 'UPGRADE',
} as const;
export type InstallReason = (typeof InstallReason)[keyof typeof InstallReason];

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

export const PART_CATEGORY_LABELS: Readonly<Record<PartCategory, string>> = {
  [PartCategory.Frame]: 'Frame',
  [PartCategory.Motor]: 'Motor',
  [PartCategory.Esc]: 'ESC',
  [PartCategory.Fc]: 'Flight controller',
  [PartCategory.Stack]: 'Stack',
  [PartCategory.Vtx]: 'VTX',
  [PartCategory.Camera]: 'Camera',
  [PartCategory.Rx]: 'Receiver',
  [PartCategory.Antenna]: 'Antenna',
  [PartCategory.Prop]: 'Props',
  [PartCategory.Battery]: 'Battery',
  [PartCategory.Other]: 'Other',
};

export const PART_CONDITION_LABELS: Readonly<Record<PartCondition, string>> = {
  [PartCondition.Serviceable]: 'Serviceable',
  [PartCondition.Broken]: 'Broken',
  [PartCondition.Retired]: 'Retired',
};

export const INSTALL_REASON_LABELS: Readonly<Record<InstallReason, string>> = {
  [InstallReason.Initial]: 'Initial build',
  [InstallReason.Replacement]: 'Replacement',
  [InstallReason.Upgrade]: 'Upgrade',
};

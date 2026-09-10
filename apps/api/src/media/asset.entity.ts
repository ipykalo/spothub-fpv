import type { AssetStatus } from '@spothub/shared';

/** An asset as the domain understands it — no ORM types, `sizeBytes` a number. */
export interface AssetEntity {
  readonly id: string;
  readonly ownerId: string;
  readonly status: AssetStatus;
  readonly storageKey: string;
  readonly fileName: string | null;
  readonly mime: string | null;
  readonly sizeBytes: number | null;
  readonly width: number | null;
  readonly height: number | null;
  /** The generated thumbnail's storage key, once one exists. */
  readonly thumbKey: string | null;
  /** Position within the subject's gallery. Only set when read through a link. */
  readonly sortOrder: number;
  readonly createdAt: Date;
}

/** Fields the persistence layer accepts when reserving an upload. */
export interface CreateAssetData {
  readonly ownerId: string;
  readonly storageKey: string;
  readonly fileName: string;
  readonly mime: string;
  readonly sizeBytes: number;
}

/** What commit learned by actually reading the bytes. */
export interface CommitAssetData {
  readonly sizeBytes: number;
  readonly width: number;
  readonly height: number;
  readonly mime: string;
  readonly thumbKey: string;
  readonly thumbStorageKey: string;
}

/**
 * What an asset is attached to.
 *
 * Only `build` exists today. The column is polymorphic so parts, repairs and
 * posts need a row rather than a table.
 */
export const AssetSubject = {
  Build: 'build',
} as const;
export type AssetSubject = (typeof AssetSubject)[keyof typeof AssetSubject];

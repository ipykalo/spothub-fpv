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
  /** The display-size version's storage key, once one exists. */
  readonly displayKey: string | null;
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
  readonly display: DisplayVersion;
}

/** A display-size version, made on commit or by the backfill. */
export interface DisplayVersion {
  readonly storageKey: string;
  readonly sizeBytes: number;
  readonly width: number;
  readonly height: number;
}

/** A profile photo as commit made it: one square WebP, the only version kept. */
export interface PilotPhotoData {
  readonly storageKey: string;
  readonly sizeBytes: number;
  readonly edge: number;
}

/** An image that still needs a display version, as the backfill sees it. */
export interface DisplayCandidate {
  readonly id: string;
  readonly ownerId: string;
  readonly storageKey: string;
}

/**
 * What an asset is attached to: a build's gallery, or the images of a post.
 * The column is polymorphic, so parts and repairs would need a row here
 * rather than a table.
 */
export const AssetSubject = {
  Build: 'build',
  Post: 'post',
} as const;
export type AssetSubject = (typeof AssetSubject)[keyof typeof AssetSubject];

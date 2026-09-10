import { z } from 'zod';

/**
 * The media contract, defined once.
 *
 * Uploading is two calls, because the bytes never pass through the API. The
 * client asks for a presigned PUT, uploads straight to storage, and then asks
 * the API to commit — which is where EXIF is stripped and the thumbnail made.
 * A request that carried the file would reintroduce the size limit, the memory
 * pressure and the upload DoS surface that the presigned flow removes.
 */

/**
 * What a browser may upload.
 *
 * The list is narrow on purpose: these are the formats `sharp` can read and
 * re-encode, which is what makes the EXIF guarantee possible. HEIC is absent
 * because the stock libvips build cannot decode it, and silently storing an
 * unprocessed file would defeat the point.
 */
export const ALLOWED_IMAGE_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const;

export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME)[number];

/** 25 MB. A phone photo is 3–8 MB; anything past this is a mistake. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const AssetStatus = {
  Pending: 'PENDING',
  Ready: 'READY',
  Failed: 'FAILED',
} as const;
export type AssetStatus = (typeof AssetStatus)[keyof typeof AssetStatus];

/**
 * Asking for somewhere to upload to.
 *
 * The size is declared up front so an oversized file is refused before a
 * single byte moves, rather than after the upload completes.
 */
export const requestUploadSchema = z.object({
  fileName: z.string().trim().min(1, 'A file needs a name').max(255),
  mime: z.enum(ALLOWED_IMAGE_MIME, {
    message: 'Only JPEG, PNG, WebP and AVIF images can be uploaded',
  }),
  sizeBytes: z.coerce
    .number()
    .int()
    .positive('That file is empty')
    .max(MAX_UPLOAD_BYTES, 'That image is larger than 25 MB'),
});
export type RequestUploadDto = z.infer<typeof requestUploadSchema>;

/** Where to PUT the bytes, and the id to commit afterwards. */
export interface UploadTicketDto {
  readonly assetId: string;
  /** Presigned PUT. Short-lived, and valid for exactly this one object. */
  readonly uploadUrl: string;
  /**
   * The `Content-Type` the PUT must send. It is part of what was signed, so a
   * mismatch is rejected by storage with a signature error.
   */
  readonly contentType: string;
  readonly expiresInSeconds: number;
}

export interface AssetDto {
  readonly id: string;
  readonly status: AssetStatus;
  readonly fileName: string | null;
  readonly mime: string | null;
  readonly sizeBytes: number | null;
  readonly width: number | null;
  readonly height: number | null;
  /** Short-lived presigned GET for the full image. The bucket stays private. */
  readonly url: string | null;
  /** Short-lived presigned GET for the thumbnail, when one exists. */
  readonly thumbUrl: string | null;
  readonly sortOrder: number;
  readonly createdAt: string;
}

/** Reordering sends the whole list, so the result cannot be ambiguous. */
export const reorderPhotosSchema = z.object({
  assetIds: z.array(z.uuid()).min(1, 'Nothing to reorder'),
});
export type ReorderPhotosDto = z.infer<typeof reorderPhotosSchema>;

/** Null clears the cover and falls back to the placeholder. */
export const setCoverSchema = z.object({
  assetId: z.union([z.uuid(), z.null()]),
});
export type SetCoverDto = z.infer<typeof setCoverSchema>;

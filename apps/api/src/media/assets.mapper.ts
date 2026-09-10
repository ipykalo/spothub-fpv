import type { AssetDto } from '@spothub/shared';

import type { AssetEntity } from './asset.entity';

/** The signed URLs are minted per response, so they are passed in, not stored. */
export interface SignedUrls {
  readonly url: string | null;
  readonly thumbUrl: string | null;
}

/**
 * The single place a domain entity becomes a wire object.
 *
 * Explicit rather than a spread, so a column added to the database is not
 * silently published by the API — `storageKey` in particular never leaves the
 * server, because the bucket is private and the URL is the only handle a
 * client should have.
 */
export function toAssetDto(asset: AssetEntity, urls: SignedUrls): AssetDto {
  return {
    id: asset.id,
    status: asset.status,
    fileName: asset.fileName,
    mime: asset.mime,
    sizeBytes: asset.sizeBytes,
    width: asset.width,
    height: asset.height,
    url: urls.url,
    thumbUrl: urls.thumbUrl,
    sortOrder: asset.sortOrder,
    createdAt: asset.createdAt.toISOString(),
  };
}

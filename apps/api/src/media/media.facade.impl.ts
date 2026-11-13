import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type PostImageDto, postImageUrl } from '@spothub/shared';

import type { Env } from '../config';
import { StorageGateway } from '../storage';
import { AssetsRepository } from './abstract/assets.repository';
import { MediaFacade } from './abstract/media.facade';
import { AssetSubject } from './asset.entity';

/** Serves the media facade out of the module's own repository and storage. */
@Injectable()
export class MediaFacadeImpl extends MediaFacade {
  private readonly downloadTtl: number;

  constructor(
    private readonly assets: AssetsRepository,
    private readonly storage: StorageGateway,
    config: ConfigService<Env, true>,
  ) {
    super();
    this.downloadTtl = config.get('S3_DOWNLOAD_URL_TTL', { infer: true });
  }

  async urlsFor(
    ownerId: string,
    assetIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>> {
    if (assetIds.length === 0) {
      return new Map();
    }

    // One database round trip; signing itself is a local computation, so a
    // page of build cards costs one query rather than one per card.
    return this.sign(await this.assets.findKeysForOwner(ownerId, assetIds));
  }

  async thumbUrlsFor(
    ownerId: string,
    assetIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>> {
    if (assetIds.length === 0) {
      return new Map();
    }

    return this.sign(await this.assets.findThumbKeysForOwner(ownerId, assetIds));
  }

  async postImages(
    authorId: string,
    postId: string,
    signed: boolean,
  ): Promise<PostImageDto[]> {
    const assets = await this.assets.findManyForSubject(
      authorId,
      AssetSubject.Post,
      postId,
    );

    if (signed) {
      // A draft is its author's alone, and an <img> cannot prove who is
      // asking, so its images are signed for the author here, as a build's are.
      return Promise.all(
        assets.map(async (asset) => ({
          id: asset.id,
          url: await this.storage.presignGet(asset.storageKey, this.downloadTtl),
          thumbUrl:
            asset.thumbKey === null
              ? null
              : await this.storage.presignGet(asset.thumbKey, this.downloadTtl),
          displayUrl:
            asset.displayKey === null
              ? null
              : await this.storage.presignGet(asset.displayKey, this.downloadTtl),
          width: asset.width,
          height: asset.height,
        })),
      );
    }

    // Addresses, not signatures: a shared post's images are served through
    // the API, which signs one per request. Nothing here expires.
    return assets.map((asset) => ({
      id: asset.id,
      url: postImageUrl(postId, asset.id),
      thumbUrl: asset.thumbKey === null ? null : postImageUrl(postId, asset.id, 'thumb'),
      // The route serves the original until the backfill has made one.
      displayUrl: postImageUrl(postId, asset.id, 'display'),
      width: asset.width,
      height: asset.height,
    }));
  }

  async deletePostImages(
    authorId: string,
    postId: string,
    keep: readonly string[],
  ): Promise<void> {
    const assets = await this.assets.findManyForSubject(
      authorId,
      AssetSubject.Post,
      postId,
    );
    const doomed = assets.filter((asset) => !keep.includes(asset.id));

    const keys = (
      await Promise.all(
        doomed.map((asset) => this.assets.deleteForOwner(authorId, asset.id)),
      )
    ).flat();

    if (keys.length > 0) {
      await this.storage.delete(keys);
    }
  }

  private async sign(
    keys: ReadonlyMap<string, string>,
  ): Promise<ReadonlyMap<string, string>> {
    const signed = await Promise.all(
      [...keys].map(
        async ([id, key]) =>
          [id, await this.storage.presignGet(key, this.downloadTtl)] as const,
      ),
    );

    return new Map(signed);
  }
}

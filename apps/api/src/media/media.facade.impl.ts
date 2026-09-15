import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PostImageDto } from '@spothub/shared';

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

  async postImages(authorId: string, postId: string): Promise<PostImageDto[]> {
    const assets = await this.assets.findManyForSubject(
      authorId,
      AssetSubject.Post,
      postId,
    );

    return Promise.all(
      assets.map(async (asset) => ({
        id: asset.id,
        url: await this.storage.presignGet(asset.storageKey, this.downloadTtl),
        thumbUrl: asset.thumbKey
          ? await this.storage.presignGet(asset.thumbKey, this.downloadTtl)
          : null,
        width: asset.width,
        height: asset.height,
      })),
    );
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

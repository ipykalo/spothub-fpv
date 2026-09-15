import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config';
import { StorageGateway } from '../storage';
import { AssetsRepository } from './abstract/assets.repository';
import { MediaFacade } from './abstract/media.facade';

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

    const keys = await this.assets.findKeysForOwner(ownerId, assetIds);

    // One database round trip above; signing itself is a local computation, so
    // a page of build cards costs one query rather than one per card.
    const signed = await Promise.all(
      [...keys].map(
        async ([id, key]) =>
          [id, await this.storage.presignGet(key, this.downloadTtl)] as const,
      ),
    );

    return new Map(signed);
  }
}

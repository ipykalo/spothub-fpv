import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MAX_UPLOAD_BYTES,
  PILOT_PHOTO_EDGE,
  type PilotPhotoDto,
  type RequestUploadDto,
  type UploadTicketDto,
  pilotPhotoUrl,
} from '@spothub/shared';
import sharp from 'sharp';

import type { Env } from '../config';
import { StorageGateway } from '../storage';
import { UsersFacade } from '../users';
import { AssetsRepository } from './abstract/assets.repository';

/**
 * A pilot's profile photo, through the same presigned rails as every other
 * image: the browser puts the bytes straight into storage, and commit is the
 * only point the API reads them.
 *
 * Commit keeps one thing: a 256 px square WebP, made from the upload with its
 * EXIF gone — a photo is often a selfie at home. The upload itself is deleted.
 * Every key sits under `<owner>/photo/`, so deleting the account, and the
 * backup's purge, find it like everything else the pilot stored.
 */
@Injectable()
export class PilotPhotoService {
  private readonly logger = new Logger(PilotPhotoService.name);
  private readonly uploadTtl: number;
  private readonly downloadTtl: number;

  constructor(
    private readonly assets: AssetsRepository,
    private readonly storage: StorageGateway,
    private readonly users: UsersFacade,
    config: ConfigService<Env, true>,
  ) {
    this.uploadTtl = config.get('S3_UPLOAD_URL_TTL', { infer: true });
    this.downloadTtl = config.get('S3_DOWNLOAD_URL_TTL', { infer: true });
  }

  async requestUpload(
    ownerId: string,
    input: RequestUploadDto,
  ): Promise<UploadTicketDto> {
    await this.users.assertCanStore(ownerId, input.sizeBytes);

    const asset = await this.assets.create({
      ownerId,
      // Ours, never the client's file name.
      storageKey: `${ownerId}/photo/upload-${randomUUID()}`,
      fileName: input.fileName,
      mime: input.mime,
      sizeBytes: input.sizeBytes,
    });

    return {
      assetId: asset.id,
      uploadUrl: await this.storage.presignPut(
        asset.storageKey,
        input.mime,
        this.uploadTtl,
      ),
      contentType: input.mime,
      expiresInSeconds: this.uploadTtl,
    };
  }

  /** Makes the upload the pilot's photo, replacing any they had. */
  async commit(ownerId: string, assetId: string): Promise<PilotPhotoDto> {
    const asset = await this.assets.findOneForOwner(ownerId, assetId);

    // Only an upload asked for here: a build photo's id cannot become a face.
    if (
      asset?.status !== 'PENDING' ||
      !asset.storageKey.startsWith(`${ownerId}/photo/`)
    ) {
      throw new NotFoundException('Upload not found');
    }

    const uploaded = await this.storage.get(asset.storageKey);

    if (!uploaded) {
      throw new BadRequestException('That upload never arrived');
    }

    let photo: Buffer;

    try {
      if (uploaded.body.byteLength > MAX_UPLOAD_BYTES) {
        throw new Error('Larger than any upload may be');
      }

      // `rotate()` applies the EXIF orientation before the re-encode drops
      // every tag; `cover` crops to the middle square.
      photo = await sharp(uploaded.body, { failOn: 'error' })
        .rotate()
        .resize(PILOT_PHOTO_EDGE, PILOT_PHOTO_EDGE, { fit: 'cover' })
        .webp({ quality: 80 })
        .toBuffer();
    } catch (error) {
      this.logger.warn(`Could not read photo upload ${assetId}`, error);
      await this.assets.deleteForOwner(ownerId, assetId);
      await this.storage.delete([asset.storageKey]);
      throw new BadRequestException('That file could not be read as an image');
    }

    const storageKey = `${ownerId}/photo/${randomUUID()}.webp`;
    await this.storage.put(storageKey, photo, 'image/webp');

    const replaced = await this.assets.setPilotPhotoForOwner(ownerId, assetId, {
      storageKey,
      sizeBytes: photo.byteLength,
      edge: PILOT_PHOTO_EDGE,
    });

    if (replaced === null) {
      // Committed twice at once: the other commit won.
      await this.storage.delete([storageKey]);
      throw new NotFoundException('Upload not found');
    }

    await this.storage.delete([asset.storageKey, ...replaced]);
    return { photoUrl: pilotPhotoUrl(ownerId, assetId) };
  }

  async remove(ownerId: string): Promise<PilotPhotoDto> {
    const keys = await this.assets.clearPilotPhotoForOwner(ownerId);
    await this.storage.delete(keys);
    return { photoUrl: null };
  }

  /**
   * Where a pilot's photo is at this moment, for the lasting address that
   * redirects to it. Anyone may see it: it stands beside a name everyone sees.
   */
  async storageUrl(userId: string): Promise<string> {
    const key = await this.assets.findPilotPhotoKey(userId);

    if (key === null) {
      throw new NotFoundException('No photo');
    }

    return this.storage.presignGet(key, this.downloadTtl);
  }
}

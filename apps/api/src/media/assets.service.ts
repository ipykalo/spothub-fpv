import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type AssetDto,
  MAX_UPLOAD_BYTES,
  type RequestUploadDto,
  type UploadTicketDto,
} from '@spothub/shared';
import sharp from 'sharp';

import type { Env } from '../config';
import { StorageGateway } from '../storage';
import { AssetsRepository } from './abstract/assets.repository';
import { type AssetEntity, AssetSubject } from './asset.entity';
import { toAssetDto } from './assets.mapper';

/** The longest edge of a generated thumbnail, in pixels. */
const THUMB_EDGE = 640;

/** How a subject is named when it cannot be found. */
const SUBJECT_NAMES: Readonly<Record<AssetSubject, string>> = {
  [AssetSubject.Build]: 'Build',
  [AssetSubject.Post]: 'Post',
};

/**
 * Business rules for media. Knows nothing about HTTP, Prisma or S3.
 *
 * The bytes never arrive here in a request. The client is handed a presigned
 * PUT, uploads straight to storage, and then asks this service to commit —
 * which is the only point at which the API reads the object.
 *
 * A build's photos and a post's images go through the same pipeline; the
 * subject says which, and every step checks the subject is the uploader's.
 */
@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);
  private readonly uploadTtl: number;
  private readonly downloadTtl: number;

  constructor(
    private readonly assets: AssetsRepository,
    private readonly storage: StorageGateway,
    config: ConfigService<Env, true>,
  ) {
    this.uploadTtl = config.get('S3_UPLOAD_URL_TTL', { infer: true });
    this.downloadTtl = config.get('S3_DOWNLOAD_URL_TTL', { infer: true });
  }

  /**
   * Reserves a key and signs a PUT for it.
   *
   * The row is written before the upload starts, so an upload the browser
   * abandoned leaves a PENDING row to sweep rather than an orphaned object
   * nothing knows about.
   */
  async requestUpload(
    ownerId: string,
    subject: AssetSubject,
    subjectId: string,
    input: RequestUploadDto,
  ): Promise<UploadTicketDto> {
    await this.assertSubject(ownerId, subject, subjectId);

    // The key is ours, never the client's file name: a name like
    // `../../etc/passwd` or a duplicate would otherwise decide where bytes land.
    const storageKey = `${ownerId}/${randomUUID()}${extensionFor(input.mime)}`;

    const asset = await this.assets.create({
      ownerId,
      storageKey,
      fileName: input.fileName,
      mime: input.mime,
      sizeBytes: input.sizeBytes,
    });

    const uploadUrl = await this.storage.presignPut(
      storageKey,
      input.mime,
      this.uploadTtl,
    );

    return {
      assetId: asset.id,
      uploadUrl,
      contentType: input.mime,
      expiresInSeconds: this.uploadTtl,
    };
  }

  /**
   * Reads what was uploaded, strips it, thumbnails it, and attaches it.
   *
   * `sharp` re-encodes rather than copying, and a re-encode carries no EXIF
   * unless asked — which is how the GPS guarantee is kept. Doing it here
   * rather than in the browser is the point: a client can lie about having
   * stripped metadata, and a home field in a photo is a home address.
   */
  async commit(
    ownerId: string,
    subject: AssetSubject,
    subjectId: string,
    assetId: string,
  ): Promise<AssetDto> {
    await this.assertSubject(ownerId, subject, subjectId);

    const asset = await this.assets.findOneForOwner(ownerId, assetId);

    if (!asset) {
      throw new NotFoundException('Upload not found');
    }

    const uploaded = await this.storage.head(asset.storageKey);

    if (!uploaded) {
      throw new BadRequestException('That upload never arrived');
    }

    // Re-checked against what actually landed, not against what was declared
    // when the URL was signed.
    if (uploaded.sizeBytes > MAX_UPLOAD_BYTES) {
      await this.discard(ownerId, assetId, [asset.storageKey]);
      throw new BadRequestException('That image is larger than 25 MB');
    }

    try {
      const committed = await this.process(
        ownerId,
        subject,
        subjectId,
        asset,
        uploaded.sizeBytes,
      );
      return toAssetDto(committed, await this.signUrls(committed));
    } catch (error) {
      this.logger.warn(`Could not process asset ${assetId}`, error);
      await this.assets.markFailedForOwner(ownerId, assetId);
      throw new BadRequestException('That file could not be read as an image');
    }
  }

  /**
   * A subject's images, for its owner or anyone it is shared with. The images
   * are already safe to show — EXIF went on commit — but the name a file had
   * on the owner's phone is theirs, so someone else sees none — a signed-out
   * visitor (a null viewer) included.
   */
  async list(
    viewerId: string | null,
    subject: AssetSubject,
    subjectId: string,
  ): Promise<AssetDto[]> {
    const ownerId = await this.assets.findSubjectOwnerVisibleToViewer(
      viewerId,
      subject,
      subjectId,
    );

    if (ownerId === null) {
      throw new NotFoundException(`${SUBJECT_NAMES[subject]} not found`);
    }

    const assets = await this.assets.findManyForSubject(ownerId, subject, subjectId);

    return Promise.all(
      assets.map(async (asset) => {
        const dto = toAssetDto(asset, await this.signUrls(asset));
        return viewerId === ownerId ? dto : { ...dto, fileName: null };
      }),
    );
  }

  async remove(
    ownerId: string,
    subject: AssetSubject,
    subjectId: string,
    assetId: string,
  ): Promise<void> {
    await this.assertSubject(ownerId, subject, subjectId);

    const keys = await this.assets.deleteForOwner(ownerId, assetId);

    if (keys.length === 0) {
      throw new NotFoundException('Image not found');
    }

    await this.storage.delete(keys);
  }

  async reorder(
    ownerId: string,
    buildId: string,
    assetIds: readonly string[],
  ): Promise<AssetDto[]> {
    await this.assertSubject(ownerId, AssetSubject.Build, buildId);
    await this.assets.reorderForSubject(ownerId, AssetSubject.Build, buildId, assetIds);

    return this.list(ownerId, AssetSubject.Build, buildId);
  }

  async setBuildCover(
    ownerId: string,
    buildId: string,
    assetId: string | null,
  ): Promise<void> {
    await this.assertSubject(ownerId, AssetSubject.Build, buildId);

    const set = await this.assets.setBuildCoverForOwner(ownerId, buildId, assetId);

    if (!set) {
      throw new NotFoundException('Photo not found on this build');
    }
  }

  async setPostCover(
    ownerId: string,
    postId: string,
    assetId: string | null,
  ): Promise<void> {
    await this.assertSubject(ownerId, AssetSubject.Post, postId);

    const set = await this.assets.setPostCoverForOwner(ownerId, postId, assetId);

    if (!set) {
      throw new NotFoundException('Image not found on this post');
    }
  }

  /** Strip, thumbnail, store both, record what was learned. */
  private async process(
    ownerId: string,
    subject: AssetSubject,
    subjectId: string,
    asset: AssetEntity,
    sizeBytes: number,
  ): Promise<AssetEntity> {
    const stored = await this.storage.get(asset.storageKey);

    if (!stored) {
      throw new Error('Object vanished between head and get');
    }

    const image = sharp(stored.body, { failOn: 'error' });
    const meta = await image.metadata();

    if (!meta.width || !meta.height) {
      throw new Error('Not a decodable image');
    }

    // `rotate()` with no argument applies the EXIF orientation *before* the
    // metadata is dropped, so a phone photo does not come out sideways.
    const stripped = await sharp(stored.body).rotate().toBuffer();

    const thumbKey = `${ownerId}/${randomUUID()}.webp`;
    const thumbnail = await sharp(stored.body)
      .rotate()
      .resize(THUMB_EDGE, THUMB_EDGE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    await this.storage.put(
      asset.storageKey,
      stripped,
      asset.mime ?? 'application/octet-stream',
    );
    await this.storage.put(thumbKey, thumbnail, 'image/webp');

    const committed = await this.assets.commitForOwner(ownerId, asset.id, {
      sizeBytes: stripped.byteLength || sizeBytes,
      width: meta.width,
      height: meta.height,
      mime: asset.mime ?? 'application/octet-stream',
      thumbKey,
      thumbStorageKey: thumbKey,
    });

    if (!committed) {
      throw new Error('Asset disappeared while committing');
    }

    // Attaching is part of committing: an image that processed but never
    // reached its subject would be invisible and unreachable.
    await this.assets.linkForOwner(ownerId, asset.id, subject, subjectId);

    return committed;
  }

  private async discard(
    ownerId: string,
    assetId: string,
    keys: readonly string[],
  ): Promise<void> {
    await this.assets.deleteForOwner(ownerId, assetId);
    await this.storage.delete(keys);
  }

  private async signUrls(
    asset: AssetEntity,
  ): Promise<{ url: string | null; thumbUrl: string | null }> {
    const [url, thumbUrl] = await Promise.all([
      this.storage.presignGet(asset.storageKey, this.downloadTtl),
      asset.thumbKey
        ? this.storage.presignGet(asset.thumbKey, this.downloadTtl)
        : Promise.resolve(null),
    ]);

    return { url, thumbUrl };
  }

  private async assertSubject(
    ownerId: string,
    subject: AssetSubject,
    subjectId: string,
  ): Promise<void> {
    const owned = await this.assets.subjectBelongsToOwner(ownerId, subject, subjectId);

    if (!owned) {
      throw new NotFoundException(`${SUBJECT_NAMES[subject]} not found`);
    }
  }
}

/** Extension from the declared type, so a stored object is recognisable. */
function extensionFor(mime: string): string {
  switch (mime) {
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/avif':
      return '.avif';
    default:
      return '.jpg';
  }
}

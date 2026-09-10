import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config';
import { StorageGateway, type StoredObject } from './abstract/storage.gateway';

/**
 * The only place in this feature that knows the AWS SDK exists.
 *
 * Everything above it speaks keys and buffers, which is what makes MinIO and
 * Blob/R2 a configuration difference rather than a code one.
 */
@Injectable()
export class S3StorageGateway extends StorageGateway {
  private readonly logger = new Logger(S3StorageGateway.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService<Env, true>) {
    super();

    this.bucket = config.get('S3_BUCKET', { infer: true });
    this.client = new S3Client({
      endpoint: config.get('S3_ENDPOINT', { infer: true }),
      region: config.get('S3_REGION', { infer: true }),
      // MinIO addresses buckets by path; AWS uses a virtual host. Get this
      // wrong and every presigned URL names a host that does not resolve.
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY', { infer: true }),
        secretAccessKey: config.get('S3_SECRET_KEY', { infer: true }),
      },
    });
  }

  presignPut(
    key: string,
    contentType: string,
    expiresInSeconds: number,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        // Signed, so the browser must send the same value or storage rejects it.
        ContentType: contentType,
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  presignGet(key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );

      if (!result.Body) {
        return null;
      }

      const body = Buffer.from(await result.Body.transformToByteArray());

      return {
        body,
        contentType: result.ContentType ?? null,
        sizeBytes: body.byteLength,
      };
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async delete(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }

    try {
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })) },
        }),
      );
    } catch (error) {
      // The rows are already gone; a stranded object costs storage, not
      // correctness, and must not fail the user's delete.
      this.logger.warn(`Could not delete ${keys.length} object(s) from storage`, error);
    }
  }

  async head(key: string): Promise<{ sizeBytes: number } | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );

      return { sizeBytes: result.ContentLength ?? 0 };
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }
}

/** S3 reports a missing key as 404/NoSuchKey; MinIO agrees. */
function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error as {
    name?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };

  return (
    candidate.name === 'NoSuchKey' ||
    candidate.name === 'NotFound' ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

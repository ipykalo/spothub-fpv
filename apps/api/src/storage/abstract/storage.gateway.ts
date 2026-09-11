/** An object read back out of storage, in memory. */
export interface StoredObject {
  readonly body: Buffer;
  readonly contentType: string | null;
  readonly sizeBytes: number;
}

/**
 * The object-storage port.
 *
 * An abstract class rather than an interface, like every other contract here,
 * so it doubles as the injection token. It exists for the same reason the
 * repository contracts do: the AWS SDK is a persistence detail, and the domain
 * must not import it. MinIO locally and Blob/R2 in production differ by
 * configuration, not by code.
 */
export abstract class StorageGateway {
  /**
   * A presigned PUT for exactly this key, size and content type.
   *
   * The content type is part of the signature, so an upload that sends a
   * different one is rejected by storage rather than stored mislabelled.
   */
  abstract presignPut(
    key: string,
    contentType: string,
    expiresInSeconds: number,
  ): Promise<string>;

  /** A short-lived presigned GET, so the bucket itself can stay private. */
  abstract presignGet(key: string, expiresInSeconds: number): Promise<string>;

  abstract get(key: string): Promise<StoredObject | null>;

  abstract put(key: string, body: Buffer, contentType: string): Promise<void>;

  abstract delete(keys: readonly string[]): Promise<void>;

  /** Whether the client actually uploaded, and what landed. */
  abstract head(key: string): Promise<{ sizeBytes: number } | null>;
}

import { Injectable, computed, inject, signal } from '@angular/core';
import {
  ALLOWED_IMAGE_MIME,
  type AssetDto,
  type AllowedImageMime,
  MAX_UPLOAD_BYTES,
} from '@spothub/shared';
import { firstValueFrom, lastValueFrom, tap } from 'rxjs';

import { PhotosApi } from './photos.api';

/** One file on its way up, so the tile can show progress before it exists. */
export interface PendingUpload {
  readonly id: string;
  readonly fileName: string;
  /** A local object URL, so the tile shows the picture during the upload. */
  readonly previewUrl: string;
  readonly progress: number;
  readonly error: string | null;
}

/**
 * Signal-backed state for one build's photos.
 *
 * The three-step upload lives here rather than in a component: asking for a
 * ticket, PUTting to storage and committing are one intent from the outside,
 * and no component should have to know the order.
 */
@Injectable({ providedIn: 'root' })
export class PhotosStore {
  private readonly api = inject(PhotosApi);

  private readonly items = signal<readonly AssetDto[]>([]);
  private readonly uploads = signal<readonly PendingUpload[]>([]);
  private readonly busy = signal(false);
  private readonly failure = signal<string | null>(null);

  readonly photos = this.items.asReadonly();
  readonly pending = this.uploads.asReadonly();
  readonly loading = this.busy.asReadonly();
  readonly error = this.failure.asReadonly();

  readonly isEmpty = computed(
    () => !this.busy() && this.items().length === 0 && this.uploads().length === 0,
  );

  async load(buildId: string): Promise<void> {
    this.busy.set(true);
    this.failure.set(null);

    try {
      this.items.set(await firstValueFrom(this.api.list(buildId)));
    } catch {
      this.failure.set('Could not load the photos.');
    } finally {
      this.busy.set(false);
    }
  }

  /** Uploads in sequence: a phone dump of twenty photos should not open twenty sockets. */
  async upload(buildId: string, files: readonly File[]): Promise<void> {
    for (const file of files) {
      await this.uploadOne(buildId, file);
    }
  }

  async remove(buildId: string, assetId: string): Promise<void> {
    const snapshot = this.items();

    // Optimistic, like the other stores: the tile goes immediately and comes
    // back if the call fails.
    this.items.update((photos) => photos.filter((photo) => photo.id !== assetId));

    try {
      await firstValueFrom(this.api.remove(buildId, assetId));
    } catch (error) {
      this.items.set(snapshot);
      throw error;
    }
  }

  async reorder(buildId: string, assetIds: readonly string[]): Promise<void> {
    const snapshot = this.items();

    // Reflect the drop immediately; the server answers with the canonical list.
    const byId = new Map(snapshot.map((photo) => [photo.id, photo]));
    this.items.set(
      assetIds
        .map((id) => byId.get(id))
        .filter((photo): photo is AssetDto => photo !== undefined),
    );

    try {
      this.items.set(await firstValueFrom(this.api.reorder(buildId, assetIds)));
    } catch (error) {
      this.items.set(snapshot);
      throw error;
    }
  }

  async setCover(buildId: string, assetId: string | null): Promise<void> {
    await firstValueFrom(this.api.setCover(buildId, assetId));
  }

  private async uploadOne(buildId: string, file: File): Promise<void> {
    const rejection = validate(file);

    if (rejection) {
      this.failure.set(rejection);
      return;
    }

    const id = crypto.randomUUID();
    const previewUrl = URL.createObjectURL(file);

    this.uploads.update((pending) => [
      ...pending,
      { id, fileName: file.name, previewUrl, progress: 0, error: null },
    ]);

    try {
      const ticket = await firstValueFrom(
        this.api.requestUpload(buildId, {
          fileName: file.name,
          mime: file.type as AllowedImageMime,
          sizeBytes: file.size,
        }),
      );

      await lastValueFrom(
        this.api.upload(ticket, file).pipe(
          tap((progress) => {
            this.patch(id, { progress });
          }),
        ),
      );

      const asset = await firstValueFrom(this.api.commit(buildId, ticket.assetId));
      this.items.update((photos) => [...photos, asset]);
      this.drop(id, previewUrl);
    } catch {
      this.patch(id, { error: 'Upload failed', progress: 0 });
    }
  }

  private patch(id: string, change: Partial<PendingUpload>): void {
    this.uploads.update((pending) =>
      pending.map((upload) => (upload.id === id ? { ...upload, ...change } : upload)),
    );
  }

  /** The object URL is revoked, or the page leaks a blob per photo. */
  private drop(id: string, previewUrl: string): void {
    URL.revokeObjectURL(previewUrl);
    this.uploads.update((pending) => pending.filter((upload) => upload.id !== id));
  }
}

/**
 * Rejected before a byte moves, using the same limits the API enforces.
 *
 * The client check is for fast feedback; the API re-checks what actually
 * landed, because a request can come from anywhere.
 */
function validate(file: File): string | null {
  if (!ALLOWED_IMAGE_MIME.includes(file.type as AllowedImageMime)) {
    return `${file.name} is not a JPEG, PNG, WebP or AVIF image`;
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return `${file.name} is larger than 25 MB`;
  }

  return null;
}

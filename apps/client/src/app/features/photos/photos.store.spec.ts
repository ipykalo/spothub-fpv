import { Injector, runInInjectionContext } from '@angular/core';
import {
  type AssetDto,
  AssetStatus,
  MAX_UPLOAD_BYTES,
  type UploadTicketDto,
} from '@spothub/shared';
import { type Observable, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PhotosApi } from './photos.api';
import { PhotosStore } from './photos.store';

/**
 * One build's photos, and the three-step upload the store hides: ask for a
 * ticket, PUT the bytes to storage, commit. What is worth holding to is that
 * a file the API would refuse never leaves the browser, that a dump of photos
 * goes up one at a time, and that every object URL the preview made is
 * revoked — a build page left open would otherwise leak a blob per photo.
 */
describe('PhotosStore', () => {
  const photo = (id: string, over: Partial<AssetDto> = {}): AssetDto => ({
    id,
    status: AssetStatus.Ready,
    fileName: `${id}.jpg`,
    mime: 'image/jpeg',
    sizeBytes: 1024,
    width: 1200,
    height: 900,
    url: null,
    thumbUrl: null,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  });

  const jpeg = (name: string, size = 1024): File => {
    const file = new File(['x'], name, { type: 'image/jpeg' });

    // A real file's size comes from its bytes; these tests need to claim one.
    Object.defineProperty(file, 'size', { value: size });

    return file;
  };

  class FakeApi {
    calls: string[] = [];
    photos: AssetDto[] = [photo('1'), photo('2'), photo('3')];
    listFails = false;
    removeFails = false;
    reorderFails = false;
    uploadFails = false;
    progress: number[] = [40, 100];

    list(): Observable<AssetDto[]> {
      return this.listFails
        ? throwError(() => new Error('offline'))
        : of([...this.photos]);
    }

    requestUpload(
      buildId: string,
      body: { fileName: string },
    ): Observable<UploadTicketDto> {
      this.calls.push(`ticket:${body.fileName}`);

      return of({
        assetId: `new-${body.fileName}`,
        uploadUrl: 'https://storage.invalid/put',
        contentType: 'image/jpeg',
        expiresInSeconds: 300,
      });
    }

    upload(): Observable<number> {
      this.calls.push('put');

      return this.uploadFails
        ? throwError(() => new Error('storage down'))
        : of(...this.progress);
    }

    commit(buildId: string, assetId: string): Observable<AssetDto> {
      this.calls.push(`commit:${assetId}`);

      return of(photo(assetId));
    }

    remove(): Observable<null> {
      return this.removeFails ? throwError(() => new Error('nope')) : of(null);
    }

    reorder(buildId: string, assetIds: readonly string[]): Observable<AssetDto[]> {
      return this.reorderFails
        ? throwError(() => new Error('nope'))
        : of(assetIds.map((id) => photo(id)));
    }

    setCover(): Observable<null> {
      this.calls.push('cover');

      return of(null);
    }
  }

  let api: FakeApi;
  let store: PhotosStore;
  const revoked: string[] = [];

  beforeEach(() => {
    revoked.length = 0;
    // Object URLs are a browser API; these tests only care that each one made
    // for a preview is given back.
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: (): string =>
        `blob:${String(revoked.length)}-${String(Math.random())}`,
      revokeObjectURL: (url: string): void => {
        revoked.push(url);
      },
    });

    api = new FakeApi();
    const injector = Injector.create({
      providers: [{ provide: PhotosApi, useValue: api }],
    });

    store = runInInjectionContext(injector, () => new PhotosStore());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts empty, and an empty gallery is not an error', () => {
    expect(store.photos()).toEqual([]);
    expect(store.pending()).toEqual([]);
    expect(store.isEmpty()).toBe(true);
    expect(store.error()).toBeNull();
  });

  describe('loading', () => {
    it('fills the gallery', async () => {
      await store.load('b1');

      expect(store.photos()).toHaveLength(3);
      expect(store.isEmpty()).toBe(false);
      expect(store.loading()).toBe(false);
    });

    it('says what went wrong rather than throwing at the page', async () => {
      api.listFails = true;

      await store.load('b1');

      expect(store.error()).toBe('Could not load the photos.');
      expect(store.loading()).toBe(false);
    });
  });

  describe('uploading', () => {
    it('walks the three steps in order and adds the committed photo', async () => {
      await store.upload('b1', [jpeg('dji.jpg')]);

      expect(api.calls).toEqual(['ticket:dji.jpg', 'put', 'commit:new-dji.jpg']);
      expect(store.photos().map((entry) => entry.id)).toEqual(['new-dji.jpg']);
    });

    it('sends a dump of photos one after another, not all at once', async () => {
      await store.upload('b1', [jpeg('one.jpg'), jpeg('two.jpg')]);

      expect(api.calls).toEqual([
        'ticket:one.jpg',
        'put',
        'commit:new-one.jpg',
        'ticket:two.jpg',
        'put',
        'commit:new-two.jpg',
      ]);
    });

    it('forgets the pending tile once the photo is real, and gives the blob back', async () => {
      await store.upload('b1', [jpeg('dji.jpg')]);

      expect(store.pending()).toEqual([]);
      expect(revoked).toHaveLength(1);
    });

    it('refuses a file the API would refuse, before a byte moves', async () => {
      const pdf = new File(['x'], 'manual.pdf', { type: 'application/pdf' });

      await store.upload('b1', [pdf]);

      expect(api.calls).toEqual([]);
      expect(store.error()).toBe('manual.pdf is not a JPEG, PNG, WebP or AVIF image');
    });

    it('refuses a file past the size limit for the same reason', async () => {
      await store.upload('b1', [jpeg('huge.jpg', MAX_UPLOAD_BYTES + 1)]);

      expect(api.calls).toEqual([]);
      expect(store.error()).toBe('huge.jpg is larger than 25 MB');
    });

    it('keeps the tile with its error when the upload fails, rather than losing it', async () => {
      api.uploadFails = true;

      await store.upload('b1', [jpeg('dji.jpg')]);

      expect(store.photos()).toEqual([]);
      expect(store.pending()).toHaveLength(1);
      expect(store.pending()[0]).toMatchObject({
        fileName: 'dji.jpg',
        error: 'Upload failed',
        progress: 0,
      });
    });

    it('is not empty while something is still on its way up', async () => {
      api.uploadFails = true;

      await store.upload('b1', [jpeg('dji.jpg')]);

      expect(store.photos()).toEqual([]);
      expect(store.isEmpty()).toBe(false);
    });
  });

  describe('removing', () => {
    it('takes the tile away at once, without waiting for the server', async () => {
      await store.load('b1');

      await store.remove('b1', '2');

      expect(store.photos().map((entry) => entry.id)).toEqual(['1', '3']);
    });

    it('puts it back when the delete fails', async () => {
      await store.load('b1');
      api.removeFails = true;

      await expect(store.remove('b1', '2')).rejects.toThrow();

      expect(store.photos().map((entry) => entry.id)).toEqual(['1', '2', '3']);
    });
  });

  describe('reordering', () => {
    it('shows the drop at once and then takes the server’s own order', async () => {
      await store.load('b1');

      await store.reorder('b1', ['3', '1', '2']);

      expect(store.photos().map((entry) => entry.id)).toEqual(['3', '1', '2']);
    });

    it('puts the old order back when the server refuses', async () => {
      await store.load('b1');
      api.reorderFails = true;

      await expect(store.reorder('b1', ['3', '1', '2'])).rejects.toThrow();

      expect(store.photos().map((entry) => entry.id)).toEqual(['1', '2', '3']);
    });
  });

  describe('the cover', () => {
    it('is the build’s to hold, so the gallery only sends the choice on', async () => {
      await store.load('b1');

      await store.setCover('b1', '2');
      await store.setCover('b1', null);

      expect(api.calls).toEqual(['cover', 'cover']);
      expect(store.photos().map((entry) => entry.id)).toEqual(['1', '2', '3']);
    });
  });
});

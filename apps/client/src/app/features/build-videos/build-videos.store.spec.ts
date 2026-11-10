import { HttpErrorResponse } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import type { BuildVideoDto, CreateBuildVideoDto } from '@spothub/shared';
import { type Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { BuildVideosApi } from './build-videos.api';
import { BuildVideosStore } from './build-videos.store';

const video = (id: string, buildId = 'b1'): BuildVideoDto => ({
  id,
  buildId,
  youtubeId: 'dQw4w9WgXcQ',
  startS: null,
  title: `Video ${id}`,
  createdAt: '2026-11-10T10:00:00.000Z',
});

describe('BuildVideosStore', () => {
  class FakeApi {
    lists: Record<string, BuildVideoDto[]> = { b1: [video('2'), video('1')], b2: [] };
    addFails: HttpErrorResponse | null = null;
    removeFails = false;
    removed: string[] = [];

    list(buildId: string): Observable<BuildVideoDto[]> {
      return of(this.lists[buildId] ?? []);
    }

    add(buildId: string, body: CreateBuildVideoDto): Observable<BuildVideoDto> {
      return this.addFails
        ? throwError(() => this.addFails)
        : of({ ...video('3', buildId), title: body.title });
    }

    remove(_buildId: string, videoId: string): Observable<null> {
      if (this.removeFails) {
        return throwError(() => new Error('offline'));
      }

      this.removed.push(videoId);
      return of(null);
    }
  }

  let api: FakeApi;
  let store: BuildVideosStore;
  const input: CreateBuildVideoDto = {
    link: { youtubeId: 'dQw4w9WgXcQ', startS: null },
    title: 'Third',
  };

  beforeEach(() => {
    api = new FakeApi();
    const injector = Injector.create({ providers: [{ provide: BuildVideosApi, useValue: api }] });
    store = runInInjectionContext(injector, () => new BuildVideosStore());
  });

  it('loads a build’s videos, and never shows the last build’s under the next', async () => {
    await store.load('b1');
    expect(store.videos().map((entry) => entry.id)).toEqual(['2', '1']);

    const loading = store.load('b2');
    expect(store.videos()).toEqual([]);
    await loading;
    expect(store.videos()).toEqual([]);
  });

  it('puts an added video first', async () => {
    await store.load('b1');

    expect(await store.add('b1', input)).toBe(true);
    expect(store.videos().map((entry) => entry.id)).toEqual(['3', '2', '1']);
    expect(store.saving()).toBe(false);
  });

  it('says why an add was refused, in the API’s words', async () => {
    api.addFails = new HttpErrorResponse({
      status: 409,
      error: { message: 'A build holds up to 20 videos. Remove one to add another.' },
    });

    expect(await store.add('b1', input)).toBe(false);
    expect(store.addError()).toBe('A build holds up to 20 videos. Remove one to add another.');
  });

  it('removes at once, and puts it back if the call fails', async () => {
    await store.load('b1');

    await store.remove('b1', '2');
    expect(store.videos().map((entry) => entry.id)).toEqual(['1']);
    expect(api.removed).toEqual(['2']);

    api.removeFails = true;
    await expect(store.remove('b1', '1')).rejects.toThrow('offline');
    expect(store.videos().map((entry) => entry.id)).toEqual(['1']);
  });
});

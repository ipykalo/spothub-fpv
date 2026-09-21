import { Injector, runInInjectionContext } from '@angular/core';
import { type PostDto, type PostSummaryDto, Visibility } from '@spothub/shared';
import { type Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { PostsApi } from './posts.api';
import { PostsStore } from './posts.store';

/**
 * The viewer's own posts, drafts included. The public blog and a post's page
 * are resolved per route instead, because they are rendered on the server —
 * so this store deliberately knows nothing about them, and writing a post
 * hands the saved post straight back to the form rather than into a list the
 * author may not be looking at.
 */
describe('PostsStore', () => {
  const summary = (id: string, over: Partial<PostSummaryDto> = {}): PostSummaryDto =>
    ({
      id,
      title: `Post ${id}`,
      slug: `post-${id}`,
      visibility: Visibility.Private,
      ...over,
    }) as PostSummaryDto;

  class FakeApi {
    posts: PostSummaryDto[] = [summary('1'), summary('2')];
    listFails = false;
    removeFails = false;

    listMine(): Observable<PostSummaryDto[]> {
      return this.listFails
        ? throwError(() => new Error('offline'))
        : of([...this.posts]);
    }

    create(input: { title: string }): Observable<PostDto> {
      return of({ ...summary('3', { title: input.title }), bodyMd: '' } as PostDto);
    }

    update(id: string, input: { title?: string }): Observable<PostDto> {
      return of({
        ...summary(id, { title: input.title ?? `Post ${id}` }),
        bodyMd: '',
      } as PostDto);
    }

    remove(): Observable<null> {
      return this.removeFails ? throwError(() => new Error('nope')) : of(null);
    }
  }

  let api: FakeApi;
  let store: PostsStore;

  beforeEach(() => {
    api = new FakeApi();
    const injector = Injector.create({
      providers: [{ provide: PostsApi, useValue: api }],
    });

    store = runInInjectionContext(injector, () => new PostsStore());
  });

  it('starts with nothing written', () => {
    expect(store.mine()).toEqual([]);
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
  });

  describe('loading', () => {
    it('fills the author’s own list, drafts included', async () => {
      await store.loadMine();

      expect(store.mine()).toHaveLength(2);
      expect(store.loading()).toBe(false);
    });

    it('says what went wrong rather than throwing at the page', async () => {
      api.listFails = true;

      await store.loadMine();

      expect(store.error()).toBe('Your posts could not be loaded.');
      expect(store.loading()).toBe(false);
    });
  });

  describe('writing', () => {
    it('hands a new post back to the form, which then navigates to it', async () => {
      await store.loadMine();

      const created = await store.create({ title: 'First flight' } as never);

      expect(created.title).toBe('First flight');
      // Not added to the list: the author is on the editor, not the list.
      expect(store.mine().map((entry) => entry.id)).toEqual(['1', '2']);
    });

    it('hands a saved post back the same way', async () => {
      const updated = await store.update('1', { title: 'Renamed' });

      expect(updated.title).toBe('Renamed');
    });
  });

  describe('deleting', () => {
    it('takes the row out once the server has agreed', async () => {
      await store.loadMine();

      await store.remove('1');

      expect(store.mine().map((entry) => entry.id)).toEqual(['2']);
    });

    it('leaves the list alone when the delete fails', async () => {
      await store.loadMine();
      api.removeFails = true;

      await expect(store.remove('1')).rejects.toThrow();

      expect(store.mine().map((entry) => entry.id)).toEqual(['1', '2']);
    });
  });
});

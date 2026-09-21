import { Injector, RESPONSE_INIT, runInInjectionContext } from '@angular/core';
import type { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import {
  CommentSubject,
  type ConversationDto,
  type PostDto,
  type PostSummaryDto,
  Visibility,
} from '@spothub/shared';
import { type Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { CommentsApi } from '../comments/comments.api';
import { PostsApi } from './posts.api';
import {
  postConversationResolver,
  postResolver,
  publishedPostsResolver,
} from './posts.resolvers';

/**
 * The blog is rendered on the server and picked up in the browser, so its
 * pages load before they exist rather than after. What these resolvers must
 * never do is throw: a failure has to come back as null and render as an
 * empty page, because a rejected resolver aborts the navigation — and on the
 * server that means a rendered error instead of a page. A post a visitor may
 * not open is also the one case that has to reach the response as a 404,
 * since a crawler otherwise indexes a "not found" page as a 200.
 */
describe('the blog resolvers', () => {
  const summary = (id: string): PostSummaryDto =>
    ({
      id,
      title: `Post ${id}`,
      slug: `post-${id}`,
      visibility: Visibility.Public,
    }) as PostSummaryDto;

  const post = (id: string): PostDto => ({ ...summary(id), bodyMd: '' }) as PostDto;

  const conversation: ConversationDto = { questions: [] } as unknown as ConversationDto;

  class FakePosts {
    listFails = false;
    getFails = false;
    asked: string[] = [];

    listPublished(): Observable<PostSummaryDto[]> {
      return this.listFails
        ? throwError(() => new Error('offline'))
        : of([summary('1'), summary('2')]);
    }

    getOne(id: string): Observable<PostDto> {
      this.asked.push(id);

      return this.getFails ? throwError(() => new Error('404')) : of(post(id));
    }
  }

  class FakeComments {
    fails = false;
    asked: [string, string][] = [];

    list(subject: string, id: string): Observable<ConversationDto> {
      this.asked.push([subject, id]);

      return this.fails ? throwError(() => new Error('404')) : of(conversation);
    }
  }

  const route = (id: string | null): ActivatedRouteSnapshot =>
    ({
      paramMap: { get: (): string | null => id },
    }) as unknown as ActivatedRouteSnapshot;

  const state = {} as RouterStateSnapshot;

  let posts: FakePosts;
  let comments: FakeComments;
  let response: { status: number };
  let injector: Injector;

  beforeEach(() => {
    posts = new FakePosts();
    comments = new FakeComments();
    response = { status: 200 };

    injector = Injector.create({
      providers: [
        { provide: PostsApi, useValue: posts },
        { provide: CommentsApi, useValue: comments },
        { provide: RESPONSE_INIT, useValue: response },
      ],
    });
  });

  /** A resolver is a function that runs in an injection context, as the router runs it. */
  function resolve<T>(
    resolver: (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => T,
    snapshot: ActivatedRouteSnapshot = route(null),
  ): T {
    return runInInjectionContext(injector, () => resolver(snapshot, state));
  }

  describe('the feed', () => {
    it('resolves the published posts', async () => {
      await expect(resolve(publishedPostsResolver)).resolves.toHaveLength(2);
    });

    it('comes back empty-handed rather than failing the navigation', async () => {
      posts.listFails = true;

      await expect(resolve(publishedPostsResolver)).resolves.toBeNull();
    });
  });

  describe('one post', () => {
    it('is asked for by the id in the address', async () => {
      await resolve(postResolver, route('abc'));

      expect(posts.asked).toEqual(['abc']);
    });

    it('asks for nothing in particular when the address carries no id', async () => {
      await resolve(postResolver, route(null));

      expect(posts.asked).toEqual(['']);
    });

    it('tells the response it was not found, so a crawler is not served a 200', async () => {
      posts.getFails = true;

      await expect(resolve(postResolver, route('abc'))).resolves.toBeNull();
      expect(response.status).toBe(404);
    });

    it('leaves the status alone for a post that is there', async () => {
      await resolve(postResolver, route('abc'));

      expect(response.status).toBe(200);
    });

    it('is happy in the browser, where there is no response to mark', async () => {
      const browser = Injector.create({
        providers: [
          { provide: PostsApi, useValue: posts },
          { provide: CommentsApi, useValue: comments },
        ],
      });
      posts.getFails = true;

      const resolved = await runInInjectionContext(browser, () =>
        postResolver(route('abc'), state),
      );

      expect(resolved).toBeNull();
    });
  });

  describe('the discussion under a post', () => {
    it('is read as the post’s own conversation', async () => {
      await resolve(postConversationResolver, route('abc'));

      expect(comments.asked).toEqual([[CommentSubject.Post, 'abc']]);
    });

    it('comes back empty-handed for a post that cannot be opened', async () => {
      comments.fails = true;

      await expect(resolve(postConversationResolver, route('abc'))).resolves.toBeNull();
    });
  });
});

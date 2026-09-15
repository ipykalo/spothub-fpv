import { RESPONSE_INIT, inject } from '@angular/core';
import type { ResolveFn } from '@angular/router';
import type { PostDto, PostSummaryDto } from '@spothub/shared';
import { firstValueFrom } from 'rxjs';

import { PostsApi } from './posts.api';

/*
 * The blog's pages are rendered on the server and picked up in the browser, so
 * what they show is resolved before they render — see
 * `builds/public-build.resolvers.ts` for why.
 */

/** The blog. Null when it could not be loaded. */
export const publishedPostsResolver: ResolveFn<
  readonly PostSummaryDto[] | null
> = async () => {
  const posts = inject(PostsApi);

  try {
    return await firstValueFrom(posts.listPublished());
  } catch {
    return null;
  }
};

/** One post a visitor may read. Null otherwise — which the server also answers as a 404. */
export const postResolver: ResolveFn<PostDto | null> = async (route) => {
  const posts = inject(PostsApi);
  const response = inject(RESPONSE_INIT, { optional: true });

  try {
    return await firstValueFrom(posts.getOne(route.paramMap.get('id') ?? ''));
  } catch {
    if (response) {
      response.status = 404;
    }

    return null;
  }
};

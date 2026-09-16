import { RESPONSE_INIT, inject } from '@angular/core';
import type { ResolveFn } from '@angular/router';
import {
  CommentSubject,
  type ConversationDto,
  type PostDto,
  type PostSummaryDto,
} from '@spothub/shared';
import { firstValueFrom } from 'rxjs';

import { CommentsApi } from '../comments/comments.api';
import { PostsApi } from './posts.api';

/*
 * Why resolvers, when the app's own pages load from their stores after they
 * render: the blog is rendered on the server and then picked up in the browser,
 * and the browser's first render has to match the server's. Data fetched after
 * a page is created lands after that first render; data resolved before it is
 * there from the start, on both sides — and in the browser it comes from the
 * responses the server rendered with, not a second fetch.
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

/** The comments under that post, as the reader sees them. Null when the post cannot be opened. */
export const postConversationResolver: ResolveFn<ConversationDto | null> = async (
  route,
) => {
  const comments = inject(CommentsApi);

  try {
    return await firstValueFrom(
      comments.list(CommentSubject.Post, route.paramMap.get('id') ?? ''),
    );
  } catch {
    return null;
  }
};

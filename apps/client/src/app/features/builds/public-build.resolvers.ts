import { RESPONSE_INIT, inject } from '@angular/core';
import type { ResolveFn } from '@angular/router';
import {
  type AssetDto,
  type BuildDto,
  type BuildPartDto,
  CommentSubject,
  type ConversationDto,
  type PostSummaryDto,
  type RepairDto,
} from '@spothub/shared';
import { firstValueFrom } from 'rxjs';

import { BuildPartsApi } from '../build-parts/build-parts.api';
import { CommentsApi } from '../comments/comments.api';
import { PhotosApi } from '../photos/photos.api';
import { PostsApi } from '../posts/posts.api';
import { RepairsApi } from '../repairs/repairs.api';
import { BuildsApi } from './builds.api';

/** Everything a public build page shows, gathered before it renders. */
export interface PublicBuildView {
  readonly build: BuildDto;
  readonly fitted: readonly BuildPartDto[];
  readonly removed: readonly BuildPartDto[];
  readonly repairs: readonly RepairDto[];
  readonly photos: readonly AssetDto[];
  readonly posts: readonly PostSummaryDto[];
  readonly conversation: ConversationDto;
}

/*
 * Why resolvers, when the app's own pages load from their stores after they
 * render: a public page is rendered on the server and then picked up in the
 * browser, and the browser's first render has to match the server's. Data
 * fetched after a page is created lands after that first render; data resolved
 * before it is there from the start, on both sides — and in the browser it
 * comes from the responses the server rendered with, not a second fetch.
 */

/** Every Public build. Null when the list could not be loaded. */
export const publicBuildsResolver: ResolveFn<readonly BuildDto[] | null> = async () => {
  const builds = inject(BuildsApi);

  try {
    return await firstValueFrom(builds.listPublic());
  } catch {
    return null;
  }
};

/**
 * One shared build and what its page shows. Null when there is no such build
 * or it is not shared — which the server also answers as a 404.
 */
export const publicBuildResolver: ResolveFn<PublicBuildView | null> = async (route) => {
  const id = route.paramMap.get('id') ?? '';
  const builds = inject(BuildsApi);
  const parts = inject(BuildPartsApi);
  const repairs = inject(RepairsApi);
  const photos = inject(PhotosApi);
  const posts = inject(PostsApi);
  const comments = inject(CommentsApi);
  const response = inject(RESPONSE_INIT, { optional: true });

  try {
    const build = await firstValueFrom(builds.getOne(id));
    const [installs, repairList, photoList, postList, conversation] = await Promise.all([
      firstValueFrom(parts.list(id)),
      firstValueFrom(repairs.list(id)),
      firstValueFrom(photos.list(id)),
      firstValueFrom(posts.listPublished({ buildId: id })),
      firstValueFrom(comments.list(CommentSubject.Build, id)),
    ]);

    return {
      build,
      // `removedOn === null` is what "currently fitted" means.
      fitted: installs.filter((install) => install.removedOn === null),
      removed: installs.filter((install) => install.removedOn !== null),
      repairs: repairList,
      photos: photoList,
      posts: postList,
      conversation,
    };
  } catch {
    if (response) {
      response.status = 404;
    }

    return null;
  }
};

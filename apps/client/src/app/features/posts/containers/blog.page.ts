import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type { PostSummaryDto } from '@spothub/shared';

import { AuthStore } from '../../../core/auth/auth.store';
import { GridToolbar } from '../../../core/components/grid-toolbar/grid-toolbar';
import {
  type GridSpec,
  GridState,
  type SortOption,
  gridView,
} from '../../../core/components/grid-toolbar/grid-view';
import { injectPageMeta } from '../../../core/seo/page-meta';
import { PostCard } from '../presenters/post-card/post-card';

type PostSortKey = 'published' | 'title';

const POST_GRID: GridSpec<PostSummaryDto, PostSortKey> = {
  text: (post) => [post.title, post.summary, post.authorName],
  sortBy: {
    published: (post) => post.publishedAt,
    title: (post) => post.title,
  },
};

const SORTS: readonly SortOption<PostSortKey>[] = [
  { key: 'published', label: 'Newest', direction: 'desc' },
  { key: 'title', label: 'Title' },
];

/**
 * Container: the blog — every Public post, for anyone, rendered on the server.
 * A signed-in reader also gets the way to write one.
 */
@Component({
  selector: 'sh-blog-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GridToolbar, MatButtonModule, MatIconModule, PostCard, RouterLink],
  templateUrl: './blog.page.html',
  styleUrl: './blog.page.scss',
})
export class BlogPage {
  /** Resolved. Null when the blog could not be loaded. */
  readonly posts = input<readonly PostSummaryDto[] | null>(null);

  protected readonly auth = inject(AuthStore);
  protected readonly sorts = SORTS;
  protected readonly grid = new GridState<PostSortKey>({
    key: 'published',
    direction: 'desc',
  });

  protected readonly rows = computed(() =>
    gridView(this.posts() ?? [], POST_GRID, this.grid.query(), this.grid.sort()),
  );

  constructor() {
    injectPageMeta().set({
      title: 'Blog',
      description: 'Build logs, crash reports and what FPV pilots learned along the way.',
    });
  }
}

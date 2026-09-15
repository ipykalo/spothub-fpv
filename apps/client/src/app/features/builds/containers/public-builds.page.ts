import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BUILD_CLASS_LABELS, type BuildDto } from '@spothub/shared';

import { GridToolbar } from '../../../core/components/grid-toolbar/grid-toolbar';
import {
  type GridSpec,
  GridState,
  type SortOption,
  gridView,
} from '../../../core/components/grid-toolbar/grid-view';
import { injectPageMeta } from '../../../core/seo/page-meta';
import { BuildCard } from '../presenters/build-card/build-card';

type PublicBuildSortKey = 'updated' | 'name' | 'added';

const PUBLIC_BUILD_GRID: GridSpec<BuildDto, PublicBuildSortKey> = {
  text: (build) => [
    build.name,
    build.ownerName,
    build.buildClass ? BUILD_CLASS_LABELS[build.buildClass] : null,
    build.descriptionMd,
  ],
  sortBy: {
    updated: (build) => build.updatedAt,
    name: (build) => build.name,
    added: (build) => build.createdAt,
  },
};

const SORTS: readonly SortOption<PublicBuildSortKey>[] = [
  { key: 'updated', label: 'Updated', direction: 'desc' },
  { key: 'name', label: 'Name' },
  { key: 'added', label: 'Added', direction: 'desc' },
];

/**
 * Container: every Public build, for anyone — signed in or not, and rendered
 * on the server. The list is resolved before the page renders (see
 * `public-build.resolvers.ts`); search and sort run on the page.
 */
@Component({
  selector: 'sh-public-builds-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BuildCard, GridToolbar],
  templateUrl: './public-builds.page.html',
  styleUrl: './public-builds.page.scss',
})
export class PublicBuildsPage {
  /** Resolved. Null when the list could not be loaded. */
  readonly builds = input<readonly BuildDto[] | null>(null);

  protected readonly sorts = SORTS;
  protected readonly grid = new GridState<PublicBuildSortKey>({
    key: 'updated',
    direction: 'desc',
  });

  protected readonly rows = computed(() =>
    gridView(this.builds() ?? [], PUBLIC_BUILD_GRID, this.grid.query(), this.grid.sort()),
  );

  constructor() {
    injectPageMeta().set({
      title: 'Builds',
      description:
        'FPV quads pilots have shared on SpotHub FPV: what went into them, what broke, and what they learned.',
    });
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import {
  BUILD_CLASS_LABELS,
  BUILD_STATUS_LABELS,
  type BuildDto,
  BuildStatus,
  CommentSubject,
} from '@spothub/shared';
import { firstValueFrom } from 'rxjs';

import { AuthStore } from '../../../core/auth/auth.store';
import { Markdown } from '../../../core/components/markdown/markdown';
import { Section } from '../../../core/components/section/section';
import { injectPageMeta } from '../../../core/seo/page-meta';
import { InstalledPartsList } from '../../build-parts/presenters/installed-parts-list/installed-parts-list';
import { CommentsSection } from '../../comments/containers/comments-section';
import { PhotoGallery } from '../../photos/presenters/photo-gallery/photo-gallery';
import { PostCard } from '../../posts/presenters/post-card/post-card';
import { RepairTimeline } from '../../repairs/presenters/repair-timeline/repair-timeline';
import { BUILD_STATUS_STYLES } from '../build-status';
import { BuildsApi } from '../builds.api';
import type { PublicBuildView } from '../public-build.resolvers';

/**
 * Container: a shared build's public page — for anyone, signed in or not, and
 * rendered on the server.
 *
 * Everything shown is resolved before the page renders and handed to the same
 * read-only presenters the app's own build page uses; there is no store behind
 * it. What the owner keeps to themselves never reaches it: the API leaves out
 * prices, sources, notes, repair costs and file names for anyone but the owner.
 *
 * Rendered for a visitor. Once in the browser, a reader who turns out to be
 * signed in has the build asked for again as themselves — their own private
 * build then opens in the app, where they can see it.
 */
@Component({
  selector: 'sh-public-build-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommentsSection,
    InstalledPartsList,
    Markdown,
    MatButtonModule,
    MatIconModule,
    PhotoGallery,
    PostCard,
    RepairTimeline,
    RouterLink,
    Section,
  ],
  templateUrl: './public-build.page.html',
  styleUrl: './public-build.page.scss',
})
export class PublicBuildPage {
  /** Route param. Bound via `withComponentInputBinding`. */
  readonly id = input.required<string>();
  /** Resolved. Null when there is no such build or it is not shared. */
  readonly view = input<PublicBuildView | null>(null);

  protected readonly auth = inject(AuthStore);
  private readonly api = inject(BuildsApi);
  private readonly router = inject(Router);
  private readonly meta = injectPageMeta();

  /** The build as a signed-in reader is answered — the same, unless it is theirs. */
  private readonly asSignedIn = signal<BuildDto | null>(null);

  protected readonly build = computed(
    () => this.asSignedIn() ?? this.view()?.build ?? null,
  );

  protected readonly statusLabels = BUILD_STATUS_LABELS;
  protected readonly classLabels = BUILD_CLASS_LABELS;
  protected readonly commentSubject = CommentSubject.Build;

  /** Same icon and tone the card and the app's build page use. */
  protected readonly statusStyle = computed(
    () => BUILD_STATUS_STYLES[this.build()?.status ?? BuildStatus.Planning],
  );

  constructor() {
    effect(() => {
      const build = this.view()?.build ?? null;

      untracked(() => {
        this.asSignedIn.set(null);
        this.meta.set(
          build
            ? { title: build.name, description: describe(build), type: 'article' }
            : { title: 'Build not found' },
        );
      });
    });

    effect(() => {
      const id = this.id();

      if (this.auth.isAuthenticated()) {
        untracked(() => void this.askAsSignedIn(id));
      }
    });
  }

  private async askAsSignedIn(id: string): Promise<void> {
    try {
      const build = await firstValueFrom(this.api.getOne(id));

      if (this.id() !== id) {
        return;
      }

      // Hidden from visitors but open to this reader: their own private build,
      // which the app's page shows in full.
      if (!this.view()) {
        await this.router.navigate(['/hangar', id], { replaceUrl: true });
        return;
      }

      this.asSignedIn.set(build);
    } catch {
      // Not theirs to see either: the page stays as it was rendered.
    }
  }
}

/** The write-up when there is one; otherwise what kind of build it is and whose. */
function describe(build: BuildDto): string {
  if (build.descriptionMd) {
    return build.descriptionMd;
  }

  const kind = build.buildClass
    ? `${BUILD_CLASS_LABELS[build.buildClass]} build`
    : 'An FPV build';
  return `${kind} shared by ${build.ownerName ?? 'a pilot'}.`;
}

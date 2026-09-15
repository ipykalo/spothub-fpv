import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { CommentSubject, type SpotDto } from '@spothub/shared';
import { firstValueFrom } from 'rxjs';

import { CollapseAll } from '../../../core/components/section/collapse-all';
import { SectionGroup } from '../../../core/components/section/section-group';
import { CommentsSection } from '../../comments/containers/comments-section';
import { SpotDetails } from '../presenters/spot-details/spot-details';
import { SpotMap } from '../presenters/spot-map/spot-map';
import { SpotsApi } from '../spots.api';
import { SpotsStore } from '../spots.store';

/**
 * Container: one spot's page. Resolves which spot to show, owns delete and
 * navigation; the map and the details are presenters, and the questions are
 * the comments feature's own section, dropped in.
 */
@Component({
  selector: 'sh-spot-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CollapseAll,
    CommentsSection,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    RouterLink,
    SpotDetails,
    SpotMap,
  ],
  hostDirectives: [SectionGroup],
  templateUrl: './spot-detail.page.html',
  styleUrl: './spot-detail.page.scss',
})
export class SpotDetailPage {
  /** Route param. Bound via `withComponentInputBinding`. */
  readonly id = input.required<string>();

  private readonly store = inject(SpotsStore);
  private readonly api = inject(SpotsApi);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly commentSubject = CommentSubject.Spot;
  protected readonly spot = signal<SpotDto | null>(null);
  protected readonly loading = signal(true);
  protected readonly failure = signal<string | null>(null);
  protected readonly deleting = signal(false);

  constructor() {
    // Route inputs land after construction, so this cannot run in the ctor.
    effect(() => {
      const id = this.id();
      untracked(() => void this.hydrate(id));
    });
  }

  protected onCopied(copied: boolean): void {
    this.snackBar.open(copied ? 'Coordinates copied' : 'Could not copy', undefined, {
      duration: 2500,
    });
  }

  protected async remove(spot: SpotDto): Promise<void> {
    this.deleting.set(true);

    try {
      await firstValueFrom(this.api.remove(spot.id));
      // The list may never have been loaded if this page was opened directly.
      if (this.store.find(spot.id)) {
        await this.store.load();
      }

      this.snackBar.open('Spot deleted', undefined, { duration: 3000 });
      await this.router.navigateByUrl('/spots');
    } catch {
      this.snackBar.open('Could not delete that spot', undefined, { duration: 4000 });
      this.deleting.set(false);
    }
  }

  private async hydrate(id: string): Promise<void> {
    this.loading.set(true);
    this.failure.set(null);

    const cached = this.store.find(id);

    if (cached) {
      this.spot.set(cached);
      this.loading.set(false);
      return;
    }

    try {
      this.spot.set(await firstValueFrom(this.api.getOne(id)));
    } catch {
      this.failure.set('That spot could not be loaded.');
    } finally {
      this.loading.set(false);
    }
  }
}

import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { PartCategory, type PartDto } from '@spothub/shared';

import { PartCard } from '../presenters/part-card/part-card';
import { PartCategoryFilter } from '../presenters/part-category-filter/part-category-filter';
import { PartsStore } from '../parts.store';

/**
 * Container: owns the store, the side effects and the notifications. Every
 * card below the toolbar is rendered by a presenter.
 */
@Component({
  selector: 'sh-parts-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    RouterLink,
    PartCard,
    PartCategoryFilter,
  ],
  templateUrl: './parts-list.page.html',
  styleUrl: './parts-list.page.scss',
})
export class PartsListPage {
  protected readonly store = inject(PartsStore);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly categories = Object.values(PartCategory);
  protected readonly pendingDelete = signal<string | null>(null);

  constructor() {
    void this.store.load();
  }

  protected onFilter(category: PartCategory | null): void {
    void this.store.load(category);
  }

  protected async remove(part: PartDto): Promise<void> {
    this.pendingDelete.set(part.id);

    try {
      await this.store.remove(part.id);
      this.snackBar.open('Part deleted', undefined, { duration: 3000 });
    } catch {
      this.snackBar.open('Could not delete that part', undefined, { duration: 4000 });
    } finally {
      this.pendingDelete.set(null);
    }
  }
}

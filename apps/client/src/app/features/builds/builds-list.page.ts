import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import {
  BUILD_CLASS_LABELS,
  BUILD_STATUS_LABELS,
  BuildStatus,
  type BuildDto,
} from '@spothub/shared';

import { BuildsStore } from './builds.store';

const STATUS_ORDER: readonly BuildStatus[] = [
  BuildStatus.Active,
  BuildStatus.Down,
  BuildStatus.Planning,
  BuildStatus.Retired,
];

@Component({
  selector: 'sh-builds-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatProgressBarModule,
    RouterLink,
  ],
  styles: `
    .toolbar {
      display: flex;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
      margin-bottom: 1.5rem;
    }

    .toolbar h1 {
      margin: 0;
      flex: 1 1 auto;
      font-size: 1.5rem;
    }

    .grid {
      display: grid;
      gap: 1rem;
      grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
    }

    .meta {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.875rem;
    }

    .empty {
      text-align: center;
      padding: 3rem 1rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .status-DOWN {
      color: var(--mat-sys-error);
    }
  `,
  template: `
    <div class="toolbar">
      <h1>Hangar</h1>
      <mat-chip-listbox
        aria-label="Filter by status"
        (change)="onFilter($any($event).value ?? null)"
      >
        <mat-chip-option [selected]="store.status() === null" [value]="null">
          All
        </mat-chip-option>
        @for (status of statuses; track status) {
          <mat-chip-option [selected]="store.status() === status" [value]="status">
            {{ statusLabels[status] }}
          </mat-chip-option>
        }
      </mat-chip-listbox>
      <button matButton="filled" routerLink="/hangar/new">
        <mat-icon>add</mat-icon>
        New build
      </button>
    </div>

    @if (store.loading()) {
      <mat-progress-bar mode="indeterminate" />
    }

    @if (store.error(); as message) {
      <p role="alert">{{ message }}</p>
    }

    @if (store.isEmpty()) {
      <div class="empty">
        <p>No builds yet.</p>
        <button matButton routerLink="/hangar/new">Add your first quad</button>
      </div>
    } @else {
      <div class="grid">
        @for (build of store.builds(); track build.id) {
          <mat-card appearance="outlined">
            <mat-card-header>
              <mat-card-title>{{ build.name }}</mat-card-title>
              <mat-card-subtitle class="status-{{ build.status }}">
                {{ statusLabels[build.status] }}
              </mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <div class="meta">
                @if (build.buildClass; as buildClass) {
                  <span>{{ classLabels[buildClass] }}</span>
                }
                @if (build.weightG; as weight) {
                  <span>{{ weight }} g</span>
                }
                @if (build.hasGps) {
                  <span>GPS</span>
                }
              </div>
            </mat-card-content>
            <mat-card-actions>
              <button matButton [routerLink]="['/hangar', build.id]">Edit</button>
              <button matButton (click)="remove(build)">Delete</button>
            </mat-card-actions>
          </mat-card>
        }
      </div>
    }
  `,
})
export class BuildsListPage {
  protected readonly store = inject(BuildsStore);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly statuses = STATUS_ORDER;
  protected readonly statusLabels = BUILD_STATUS_LABELS;
  protected readonly classLabels = BUILD_CLASS_LABELS;
  protected readonly pendingDelete = signal<string | null>(null);

  constructor() {
    void this.store.load();
  }

  protected onFilter(status: BuildStatus | null): void {
    void this.store.load(status);
  }

  protected async remove(build: BuildDto): Promise<void> {
    this.pendingDelete.set(build.id);

    try {
      await this.store.remove(build.id);
      this.snackBar.open(`Deleted ${build.name}`, undefined, { duration: 3000 });
    } catch {
      this.snackBar.open('Could not delete that build', undefined, { duration: 4000 });
    } finally {
      this.pendingDelete.set(null);
    }
  }
}

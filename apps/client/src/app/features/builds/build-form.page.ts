import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  BUILD_CLASS_LABELS,
  BUILD_STATUS_LABELS,
  BuildClass,
  BuildStatus,
  VISIBILITY_LABELS,
  Visibility,
  createBuildSchema,
  type BuildDto,
} from '@spothub/shared';

import { BuildsApi } from './builds.api';
import { BuildsStore } from './builds.store';

@Component({
  selector: 'sh-build-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  styles: `
    mat-card {
      max-width: 44rem;
    }

    form {
      display: grid;
      gap: 0.5rem;
    }

    .row {
      display: grid;
      gap: 0.5rem;
      grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    }

    .actions {
      display: flex;
      gap: 0.75rem;
      margin-top: 1rem;
    }
  `,
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>{{ isEdit() ? 'Edit build' : 'New build' }}</mat-card-title>
      </mat-card-header>

      <mat-card-content>
        <form [formGroup]="form" (ngSubmit)="save()">
          <mat-form-field>
            <mat-label>Name</mat-label>
            <input matInput formControlName="name" placeholder="Mark4 5-inch" />
            @if (form.controls.name.hasError('required')) {
              <mat-error>Give the build a name</mat-error>
            }
          </mat-form-field>

          <div class="row">
            <mat-form-field>
              <mat-label>Class</mat-label>
              <mat-select formControlName="buildClass">
                <mat-option [value]="null">Unspecified</mat-option>
                @for (item of classes; track item) {
                  <mat-option [value]="item">{{ classLabels[item] }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field>
              <mat-label>Status</mat-label>
              <mat-select formControlName="status">
                @for (item of statuses; track item) {
                  <mat-option [value]="item">{{ statusLabels[item] }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field>
              <mat-label>Visibility</mat-label>
              <mat-select formControlName="visibility">
                @for (item of visibilities; track item) {
                  <mat-option [value]="item">{{ visibilityLabels[item] }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field>
              <mat-label>All-up weight (g)</mat-label>
              <input matInput type="number" formControlName="weightG" min="1" />
            </mat-form-field>
          </div>

          <mat-checkbox formControlName="hasGps">Has GPS</mat-checkbox>

          <mat-form-field>
            <mat-label>Build notes (Markdown)</mat-label>
            <textarea matInput rows="6" formControlName="descriptionMd"></textarea>
          </mat-form-field>

          @if (failure(); as message) {
            <p role="alert">{{ message }}</p>
          }

          <div class="actions">
            <button matButton="filled" type="submit" [disabled]="saving()">
              {{ saving() ? 'Saving…' : 'Save' }}
            </button>
            <button matButton type="button" (click)="cancel()">Cancel</button>
          </div>
        </form>
      </mat-card-content>
    </mat-card>
  `,
})
export class BuildFormPage {
  /** Route param; absent when creating. Bound via `withComponentInputBinding`. */
  readonly id = input<string | undefined>(undefined);

  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly store = inject(BuildsStore);
  private readonly api = inject(BuildsApi);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly classes = Object.values(BuildClass);
  protected readonly statuses = Object.values(BuildStatus);
  protected readonly visibilities = Object.values(Visibility);
  protected readonly classLabels = BUILD_CLASS_LABELS;
  protected readonly statusLabels = BUILD_STATUS_LABELS;
  protected readonly visibilityLabels = VISIBILITY_LABELS;

  protected readonly saving = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly isEdit = computed(() => this.id() !== undefined);

  protected readonly form = this.fb.group({
    // `Validators.required` is a static function that never reads `this`; the
    // unbound-method rule cannot tell the difference.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    name: ['', [Validators.required, Validators.maxLength(80)]],
    buildClass: [null as BuildClass | null],
    status: [BuildStatus.Planning as BuildStatus],
    visibility: [Visibility.Private as Visibility],
    weightG: [null as number | null],
    hasGps: [false],
    descriptionMd: [''],
  });

  constructor() {
    void this.hydrate();
  }

  protected async save(): Promise<void> {
    this.failure.set(null);

    // The same schema the API validates against, so the two cannot disagree
    // about what a valid build looks like.
    const parsed = createBuildSchema.safeParse({
      ...this.form.getRawValue(),
      descriptionMd: this.form.getRawValue().descriptionMd || null,
    });

    if (!parsed.success) {
      this.form.markAllAsTouched();
      this.failure.set(parsed.error.issues[0]?.message ?? 'Check the form');
      return;
    }

    this.saving.set(true);

    try {
      const id = this.id();

      if (id) {
        await this.store.update(id, parsed.data);
      } else {
        await this.store.create(parsed.data);
      }

      this.snackBar.open('Saved', undefined, { duration: 2500 });
      await this.router.navigateByUrl('/hangar');
    } catch {
      this.failure.set('Could not save. Check the fields and try again.');
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    void this.router.navigateByUrl('/hangar');
  }

  /** Fills the form when editing, preferring the already-loaded list entry. */
  private async hydrate(): Promise<void> {
    const id = this.id();

    if (!id) {
      return;
    }

    const cached = this.store.find(id);
    const build = cached ?? (await this.fetch(id));

    if (!build) {
      this.failure.set('That build could not be loaded.');
      return;
    }

    this.form.patchValue({
      name: build.name,
      buildClass: build.buildClass,
      status: build.status,
      visibility: build.visibility,
      weightG: build.weightG,
      hasGps: build.hasGps,
      descriptionMd: build.descriptionMd ?? '',
    });
  }

  private async fetch(id: string): Promise<BuildDto | null> {
    try {
      return await firstValueFrom(this.api.getOne(id));
    } catch {
      return null;
    }
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { BuildDto, CreateBuildDto } from '@spothub/shared';

import { BuildForm } from '../presenters/build-form/build-form';
import { BuildsApi } from '../builds.api';
import { BuildsStore } from '../builds.store';

/**
 * Container: resolves which build is being edited, persists what the form
 * hands back, and owns navigation. It renders no fields of its own.
 */
@Component({
  selector: 'sh-build-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BuildForm],
  templateUrl: './build-form.page.html',
})
export class BuildFormPage {
  /** Route param; absent when creating. Bound via `withComponentInputBinding`. */
  readonly id = input<string | undefined>(undefined);

  private readonly store = inject(BuildsStore);
  private readonly api = inject(BuildsApi);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly build = signal<BuildDto | null>(null);
  protected readonly saving = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly isEdit = computed(() => this.id() !== undefined);

  constructor() {
    void this.hydrate();
  }

  protected async save(input: CreateBuildDto): Promise<void> {
    this.failure.set(null);
    this.saving.set(true);

    try {
      const id = this.id();

      if (id) {
        await this.store.update(id, input);
      } else {
        await this.store.create(input);
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

    this.build.set(build);
  }

  private async fetch(id: string): Promise<BuildDto | null> {
    try {
      return await firstValueFrom(this.api.getOne(id));
    } catch {
      return null;
    }
  }
}

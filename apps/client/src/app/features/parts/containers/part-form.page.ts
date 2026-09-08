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
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { PartDto, PartSourceDto, UrlPreviewDto } from '@spothub/shared';

import { PartForm, type PartSubmission } from '../presenters/part-form/part-form';
import { PartsApi } from '../parts.api';
import { PartsStore } from '../parts.store';

/**
 * Container: resolves which part is being edited, persists what the form hands
 * back, and owns navigation. It renders no fields of its own.
 */
@Component({
  selector: 'sh-part-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PartForm],
  templateUrl: './part-form.page.html',
})
export class PartFormPage {
  /** Route param; absent when creating. Bound via `withComponentInputBinding`. */
  readonly id = input<string | undefined>(undefined);

  private readonly store = inject(PartsStore);
  private readonly api = inject(PartsApi);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly part = signal<PartDto | null>(null);
  protected readonly saving = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly previewLoading = signal(false);
  protected readonly preview = signal<UrlPreviewDto | null>(null);
  protected readonly isEdit = computed(() => this.id() !== undefined);

  constructor() {
    // Route inputs are bound *after* construction, so reading id() directly in
    // the constructor always sees undefined and the form silently stays blank.
    // An effect runs again once the input lands. `untracked` keeps store reads
    // inside hydrate from re-triggering it.
    effect(() => {
      const id = this.id();

      if (id) {
        untracked(() => void this.hydrate(id));
      }
    });
  }

  protected async save(submission: PartSubmission): Promise<void> {
    this.failure.set(null);
    this.saving.set(true);

    try {
      const id = this.id();
      const part = id
        ? await this.store.update(id, submission.part)
        : await this.store.create(submission.part);

      if (submission.source) {
        await this.store.addSource(part.id, submission.source);
      }

      this.snackBar.open('Saved', undefined, { duration: 2500 });
      await this.router.navigateByUrl('/parts');
    } catch {
      this.failure.set('Could not save. Check the fields and try again.');
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * The lookup is a server call because the browser cannot read another
   * origin's HTML, and because the API is where the SSRF guard lives.
   */
  protected async enrich(url: string): Promise<void> {
    this.previewLoading.set(true);
    this.failure.set(null);

    try {
      const preview = await firstValueFrom(this.api.urlPreview(url));
      this.preview.set(preview);

      if (!preview.title && preview.price === null) {
        this.snackBar.open('That page published nothing useful', undefined, {
          duration: 3500,
        });
      }
    } catch {
      this.failure.set('Could not read that link.');
    } finally {
      this.previewLoading.set(false);
    }
  }

  protected async removeSource(source: PartSourceDto): Promise<void> {
    try {
      await this.store.removeSource(source.partId, source.id);
      this.part.set(this.store.find(source.partId) ?? null);
    } catch {
      this.failure.set('Could not remove that source.');
    }
  }

  protected cancel(): void {
    void this.router.navigateByUrl('/parts');
  }

  /** Fills the form when editing, preferring the already-loaded list entry. */
  private async hydrate(id: string): Promise<void> {
    const cached = this.store.find(id);
    const part = cached ?? (await this.fetch(id));

    if (!part) {
      this.failure.set('That part could not be loaded.');
      return;
    }

    this.part.set(part);
  }

  private async fetch(id: string): Promise<PartDto | null> {
    try {
      return await firstValueFrom(this.api.getOne(id));
    } catch {
      return null;
    }
  }
}

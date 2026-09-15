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
import type { CreateSpotDto, SpotDto } from '@spothub/shared';
import { firstValueFrom } from 'rxjs';

import { SpotForm } from '../presenters/spot-form/spot-form';
import type { LatLng } from '../spot-style';
import { SpotsApi } from '../spots.api';
import { SpotsStore } from '../spots.store';

/**
 * Container: resolves which spot is being edited — or which point a new one
 * was picked at — persists what the form hands back, and owns navigation.
 */
@Component({
  selector: 'sh-spot-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SpotForm],
  templateUrl: './spot-form.page.html',
  styleUrl: './spot-form.page.scss',
})
export class SpotFormPage {
  /** Route param; absent when creating. Bound via `withComponentInputBinding`. */
  readonly id = input<string | undefined>(undefined);
  /** Query params from a point picked on the map. */
  readonly lat = input<string | undefined>(undefined);
  readonly lng = input<string | undefined>(undefined);

  private readonly store = inject(SpotsStore);
  private readonly api = inject(SpotsApi);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly spot = signal<SpotDto | null>(null);
  protected readonly saving = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly isEdit = computed(() => this.id() !== undefined);

  /** A URL someone edited by hand can carry anything; only a real point counts. */
  protected readonly initialPoint = computed<LatLng | null>(() => {
    const lat = Number(this.lat());
    const lng = Number(this.lng());

    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      ? { lat, lng }
      : null;
  });

  constructor() {
    effect(() => {
      const id = this.id();

      if (id) {
        untracked(() => void this.hydrate(id));
      }
    });
  }

  protected async save(input: CreateSpotDto): Promise<void> {
    this.failure.set(null);
    this.saving.set(true);

    try {
      const id = this.id();
      const spot = id ? await this.store.update(id, input) : await this.store.create(input);

      this.snackBar.open('Saved', undefined, { duration: 2500 });
      await this.router.navigate(['/spots', spot.id]);
    } catch {
      this.failure.set('Could not save. Check the fields and try again.');
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    const id = this.id();
    void this.router.navigate(id ? ['/spots', id] : ['/spots']);
  }

  private async hydrate(id: string): Promise<void> {
    const cached = this.store.find(id);

    if (cached) {
      this.spot.set(cached);
      return;
    }

    try {
      this.spot.set(await firstValueFrom(this.api.getOne(id)));
    } catch {
      this.failure.set('That spot could not be loaded.');
    }
  }
}
